// Email codes and Google sign-in. Only approved emails can receive a code or create an account.
import {betterAuth} from "better-auth";
import {APIError} from "better-auth/api";
import {emailOTP,oAuthProxy} from "better-auth/plugins";

const DAY=86400;
export const SESSION_COOKIE="health.session_token";

export function createAuth(env,{appName,baseURL=env.PUBLIC_ORIGIN,isApproved,deliverCode}){
 const google=env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET?{google:{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,prompt:"select_account",overrideUserInfoOnSignIn:true}}:{};
 return betterAuth({
  appName,
  baseURL,
  trustedOrigins:[...new Set([env.PUBLIC_ORIGIN,...String(env.APP_ORIGINS||"").split(",").filter(Boolean)])],
  basePath:"/api/signin",
  secret:env.BETTER_AUTH_SECRET,
  database:env.DB,
  user:{modelName:"health_signin_users"},
  session:{modelName:"health_signin_sessions",expiresIn:90*DAY,updateAge:DAY},
  account:{modelName:"health_signin_accounts",accountLinking:{enabled:true,trustedProviders:["google"]}},
  verification:{modelName:"health_signin_verifications"},
  socialProviders:google,
  // The Worker's rate limit bindings cover sign-in, and an isolate's memory wouldn't.
  rateLimit:{enabled:false},
  // The schema is managed by db/migrations and checked by tests, so the library needn't read it on every request.
  advanced:{cookiePrefix:"health",ipAddress:{disableIpTracking:true},database:{validateSchema:false}},
  // A problem with no sign-in of its own to return to ends on the app, not on the library's error page.
  onAPIError:{errorURL:env.PUBLIC_ORIGIN+"/?auth=failed#data"},
  plugins:[emailOTP({otpLength:6,expiresIn:600,allowedAttempts:5,storeOTP:"hashed",
   sendVerificationOTP:async({email,otp})=>deliverCode(email,otp)}),
   // Google returns to one fixed address, which hands the result to whichever app address started the sign-in.
   ...(env.GOOGLE_RELAY_ORIGIN?[oAuthProxy({productionURL:env.GOOGLE_RELAY_ORIGIN,maxAge:60})]:[])],
  databaseHooks:{
   user:{create:{before:async user=>{
    if(!await isApproved(String(user.email).trim().toLowerCase()))throw new APIError("FORBIDDEN",{message:"This email isn't on the list yet."});
    return {data:user};
   }}},
   // Google's tokens aren't used after sign-in, so they aren't kept.
   account:{create:{before:async account=>({data:{...account,accessToken:null,refreshToken:null,idToken:null,accessTokenExpiresAt:null,refreshTokenExpiresAt:null}})},
    update:{before:async account=>({data:{...account,accessToken:null,refreshToken:null,idToken:null,accessTokenExpiresAt:null,refreshTokenExpiresAt:null}})}}
  }
 });
}
