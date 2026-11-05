// Email codes and Google sign-in. Only approved emails can receive a code or create an account.
import {betterAuth} from "better-auth";
import {APIError} from "better-auth/api";
import {emailOTP} from "better-auth/plugins";

const DAY=86400;
export const SESSION_COOKIE="even.session_token";

export function createAuth(env,{isApproved,deliverCode}){
 const google=env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET?{google:{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,prompt:"select_account"}}:{};
 return betterAuth({
  appName:"Even",
  baseURL:env.PUBLIC_ORIGIN,
  basePath:"/api/signin",
  secret:env.BETTER_AUTH_SECRET,
  database:env.DB,
  user:{modelName:"even_signin_users"},
  session:{modelName:"even_signin_sessions",expiresIn:90*DAY,updateAge:DAY},
  account:{modelName:"even_signin_accounts",accountLinking:{enabled:true,trustedProviders:["google"]}},
  verification:{modelName:"even_signin_verifications"},
  socialProviders:google,
  // The Worker's rate limit bindings cover sign-in, and an isolate's memory wouldn't.
  rateLimit:{enabled:false},
  advanced:{cookiePrefix:"even",ipAddress:{disableIpTracking:true}},
  plugins:[emailOTP({otpLength:6,expiresIn:600,allowedAttempts:5,storeOTP:"hashed",
   sendVerificationOTP:async({email,otp})=>deliverCode(email,otp)})],
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
