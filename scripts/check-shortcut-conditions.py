#!/usr/bin/env python3
"""Check compiled Apple Shortcuts property lists before they are signed.

This inspects the generated property list, not the higher-level Cherri source. A Shortcut can compile
successfully while an If action has no usable right operand, or while a field no longer refers to the
value it should send.

Usage: check-shortcut-conditions.py <Even Sync.plist>
       check-shortcut-conditions.py --helper <Even Release.plist>
"""

from __future__ import annotations

import collections
import json
import plistlib
import sys
from pathlib import Path


SYNC_TEXT = collections.Counter({"on": 7, "connected": 1, "accepted": 2, "needed": 1, "new_release": 1, "sent": 1})
SYNC_NUMBERS = [0, 0, 0, 0] + [1] * 15 + [7] * 4
HELPER_TEXT = collections.Counter({
    "Even Sync": 2, "Even Release": 1, "\ufffc": 1, "share": 1, "install": 1, "building": 1,
    "ahead": 1, "current": 2, "publish": 1, "Publish": 1,
})
HELPER_NUMBERS = [0, 1, 1, 1, 1, 1]

TIMESTAMP_PATTERN = "yyyy-MM-dd'T'HH:mm:ssZZZZZ"
KEY_FILE = "even-device-key.txt"
STEP_GROUPING_PATTERN = r"(?<=\d)[,\s](?=\d{3}(?:\D|$))"


def unwrap_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("String", "string", "WFTextActionText", "Value"):
            if key in value:
                result = unwrap_text(value[key])
                if isinstance(result, str):
                    return result
    return None


def operands(params):
    groups = []
    condition = params.get("WFConditions")
    if isinstance(condition, dict):
        wrapper = condition.get("Value", {})
        if isinstance(wrapper, dict):
            groups = wrapper.get("WFActionParameterFilterTemplates", [])
    if not groups:
        groups = [params]
    for item in groups:
        text = unwrap_text(item.get("WFConditionalActionString"))
        number = item.get("WFNumberValue")
        if text is not None:
            yield ("text", text, item.get("WFCondition"))
        elif isinstance(number, (int, float, str)) and not isinstance(number, bool):
            yield ("number", number, item.get("WFCondition"))
        else:
            yield ("missing", None, item.get("WFCondition"))


def check_conditions(actions, expected_text, expected_numbers) -> None:
    """Every If keeps an explicit right-hand value, and the values are the expected ones."""
    observed = []
    for index, action in enumerate(actions):
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        params = action.get("WFWorkflowActionParameters", {})
        if params.get("WFControlFlowMode") != 0:
            continue
        for kind, value, operator in operands(params):
            observed.append({"action": index, "kind": kind, "value": value, "operator": operator})

    print(json.dumps({"conditions": observed}, indent=2))
    expected_total = sum(expected_text.values()) + len(expected_numbers)
    if len(observed) != expected_total:
        raise AssertionError(f"Expected {expected_total} If comparisons, found {len(observed)}")
    missing = [row for row in observed if row["kind"] == "missing" or row["value"] == ""]
    if missing:
        raise AssertionError(f"If conditions missing right operands: {missing}")
    texts = collections.Counter(row["value"] for row in observed if row["kind"] == "text")
    numbers = sorted(float(row["value"]) for row in observed if row["kind"] == "number")
    if texts != expected_text:
        raise AssertionError(f"Unexpected text operands: {texts}; expected {expected_text}")
    if numbers != sorted(float(n) for n in expected_numbers):
        raise AssertionError(f"Unexpected numeric operands: {numbers}; expected {expected_numbers}")
    print(f"All {expected_total} If comparisons have explicit, expected right-hand values.")


def named_outputs(actions):
    return {
        action.get("WFWorkflowActionParameters", {}).get("CustomOutputName"): action
        for action in actions
        if action.get("WFWorkflowActionParameters", {}).get("CustomOutputName")
    }


def forms(actions):
    """Each form request's fields, keyed by field name."""
    result = []
    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.downloadurl":
            continue
        items = action.get("WFWorkflowActionParameters", {}).get("WFFormValues", {}).get("Value", {}).get("WFDictionaryFieldValueItems", [])
        fields = {
            item.get("WFKey", {}).get("Value", {}).get("string"): item.get("WFValue", {}).get("Value", {})
            for item in items
        }
        if fields:
            result.append((action, fields))
    return result


def refers_to_variable(value, name) -> bool:
    return f'"VariableName": "{name}"' in json.dumps(value)


def check_timestamps_and_records(actions) -> None:
    """Calendar and sleep times keep their date, time and time zone, and reach the records that are sent."""
    named = named_outputs(actions)
    for time_name, source_name in (
        ("startISO", "startDate"), ("endISO", "endDate"),
        ("upcomingStartISO", "upcomingStart"), ("upcomingEndISO", "upcomingEnd"),
        ("sleepStartISO", "sleepStart"), ("sleepEndISO", "sleepEnd"),
    ):
        item = named.get(time_name, {}).get("WFWorkflowActionParameters")
        if not item:
            raise AssertionError(f"Missing compiled date formatter {time_name}")
        actual = (item.get("WFDateFormatStyle"), item.get("WFTimeFormatStyle"), item.get("WFDateFormat"))
        if actual != ("Custom", "None", TIMESTAMP_PATTERN):
            raise AssertionError(f"{time_name} strips the time or time zone: {actual}")
        source = item.get("WFDate", {}).get("Value", {}).get("attachmentsByRange", {}).get("{0, 1}", {})
        if source.get("OutputName") != source_name:
            raise AssertionError(f"{time_name} does not format {source_name}")

    dumps = [json.dumps(action) for action in actions]
    for variable, parts in (
        ("eventRecords", ("startISO", "endISO", "calendarName", "title")),
        ("eventRecords", ("upcomingStartISO", "upcomingEndISO", "upcomingCalendar", "upcomingTitle")),
        ("sleepIntervals", ("sleepStartISO", "sleepEndISO")),
    ):
        if not any(f'"VariableName": "{variable}"' in dump and all(f'"OutputName": "{part}"' in dump for part in parts) for dump in dumps):
            raise AssertionError(f"No record appends {', '.join(parts)} to {variable}")

    sent = forms(actions)
    calendar = [fields for _, fields in sent if fields.get("kind", {}).get("string") == "calendar_days"]
    if len(calendar) != 1:
        raise AssertionError(f"Expected one calendar upload, found {len(calendar)}")
    if any(fields.get("kind", {}).get("string") in ("calendar", "calendar_complete") for _, fields in sent):
        raise AssertionError("Even Sync still sends events one at a time")
    if not refers_to_variable(calendar[0].get("events"), "eventRecords"):
        raise AssertionError("The calendar upload does not send the event records")
    if any("heartRate" in fields for _, fields in sent):
        raise AssertionError("Even Sync still sends average heart rate")
    print("Calendar and sleep records keep full ISO date-times with time zones, and both days go up together.")


def check_alarms(actions) -> None:
    """Alarm details exist only as variable properties, so confirm they survive compiling."""
    identifiers = [a.get("WFWorkflowActionIdentifier") for a in actions]
    if "com.apple.mobiletimer-framework.MobileTimerIntents.MTGetAlarmsIntent" not in identifiers:
        raise AssertionError("Even Sync does not read alarms")
    compiled = plistlib.dumps({"actions": actions}).decode()
    for name in ("Time", "Repeat", "Is Enabled", "Name"):
        if f"<string>{name}</string>" not in compiled:
            raise AssertionError(f"Alarm property {name} is missing from the compiled Shortcut")
    print("Even Sync reads alarms with their time, repeat, state and name.")


def check_connection_and_health(document, actions) -> None:
    if document.get("WFWorkflowImportQuestions", []):
        raise AssertionError("Even Sync cannot ask for a device key when reinstalled")

    named = named_outputs(actions)
    by_id = lambda identifier: [a for a in actions if a.get("WFWorkflowActionIdentifier") == identifier]
    if any("runworkflow" in a.get("WFWorkflowActionIdentifier", "") for a in actions):
        raise AssertionError("Even Sync must not depend on another Shortcut")

    for finder, types in (
        ("is.workflow.actions.filter.calendarevents", [None, None]),
        ("is.workflow.actions.filter.health.quantity", ["Steps", "Steps", "Resting Heart Rate", "Heart Rate Variability", "Exercise Minutes", "Sleep", "Sleep"]),
    ):
        found = by_id(finder)
        if len(found) != len(types):
            raise AssertionError(f"Expected {len(types)} {finder} actions, found {len(found)}")
        for action, expected_type in zip(found, types):
            template = action["WFWorkflowActionParameters"].get("WFContentItemFilter", {})
            if template.get("WFSerializationType") != "WFContentPredicateTableTemplate":
                raise AssertionError(f"{finder} filter is not in Apple's filter format and would be ignored")
            rows = template["Value"]["WFActionParameterFilterTemplates"]
            actual = rows[0]["Values"]["Enumeration"]["Value"] if expected_type else None
            if actual != expected_type:
                raise AssertionError(f"Expected filter type {expected_type}, found {actual}")
            if any(row.get("Values", {}).get("Enumeration", {}).get("Value") == "Heart Rate" for row in rows):
                raise AssertionError("Even Sync still reads average heart rate")

    reads = [a for a in by_id("is.workflow.actions.documentpicker.open") if a.get("WFWorkflowActionParameters", {}).get("WFGetFilePath") == KEY_FILE]
    if len(reads) != 1:
        raise AssertionError(f"Expected one saved-key read, found {len(reads)}")
    read = reads[0].get("WFWorkflowActionParameters", {})
    folders = by_id("is.workflow.actions.file.createfolder")
    if len(folders) != 1:
        raise AssertionError(f"Expected one key folder step, found {len(folders)}")
    folder = folders[0].get("WFWorkflowActionParameters", {})
    if folder.get("WFFilePath") != "Even" or "LocalStorage" not in json.dumps(folder.get("WFFolder", {})):
        raise AssertionError("Key folder must be created in On My iPhone")
    if "keyFolder" not in json.dumps(read.get("WFFile", {})):
        raise AssertionError("Saved-key read must use the created folder")
    if (read.get("WFGetFilePath"), read.get("WFFileErrorIfNotFound"), read.get("WFShowFilePicker")) != (KEY_FILE, False, False):
        raise AssertionError("Saved-key read must use the key path without a picker or a missing-file error")

    saves = [a for a in by_id("is.workflow.actions.documentpicker.save") if a.get("WFWorkflowActionParameters", {}).get("WFFileDestinationPath") == KEY_FILE]
    if len(saves) != 1:
        raise AssertionError(f"Expected one saved-key write, found {len(saves)}")
    save = saves[0].get("WFWorkflowActionParameters", {})
    if "keyFolder" not in json.dumps(save.get("WFFolder", {})):
        raise AssertionError("Saved-key write must use the created folder")
    if (save.get("WFFileDestinationPath"), save.get("WFSaveFileOverwrite"), save.get("WFAskWhereToSave")) != (KEY_FILE, True, False):
        raise AssertionError("Saved-key write must overwrite the key path without asking where to save")
    if json.dumps(save.get("WFInput", {})).find("credential") < 0:
        raise AssertionError("Saved-key write does not receive the accepted credential")

    total = named.get("totalSteps", {})
    total_settings = total.get("WFWorkflowActionParameters", {})
    if total.get("WFWorkflowActionIdentifier") != "is.workflow.actions.statistics" or total_settings.get("WFStatisticsOperation") != "Sum" or '"values"' not in json.dumps(total_settings.get("Input", {})):
        raise AssertionError("Step sum does not receive the Health sample values")

    normalizer = named.get("normalizedSteps", {})
    settings = normalizer.get("WFWorkflowActionParameters", {})
    if normalizer.get("WFWorkflowActionIdentifier") != "is.workflow.actions.text.replace":
        raise AssertionError("Step total was not normalized through Replace Text")
    if settings.get("WFReplaceTextFind") != STEP_GROUPING_PATTERN or not settings.get("WFReplaceTextRegularExpression"):
        raise AssertionError("Step count grouping-separator removal is missing or malformed")
    text_input = settings.get("WFInput", {}).get("Value", {}).get("attachmentsByRange", {}).get("{0, 1}", {})
    if text_input.get("OutputName") != "totalStepsText":
        raise AssertionError("Step normalizer is not receiving the statistic's textual value")

    extractor_action = named.get("stepsValue", {})
    extractor = extractor_action.get("WFWorkflowActionParameters", {})
    extractor_input = extractor.get("WFInput", {}).get("Value", {}).get("attachmentsByRange", {}).get("{0, 1}", {})
    if extractor.get("WFReplaceTextReplace") != "$1" or not extractor.get("WFReplaceTextRegularExpression") or extractor_input.get("OutputName") != "normalizedSteps":
        raise AssertionError("Step number extraction is missing or malformed")
    # The field is built up as day=value pairs, so the value reaches it through a text action.
    identifier = extractor_action.get("WFWorkflowActionParameters", {}).get("UUID")
    if not identifier or not any(a is not extractor_action and identifier in json.dumps(a.get("WFWorkflowActionParameters", {})) for a in actions):
        raise AssertionError("The steps field is not set from the numeric step value")

    health = named.get("healthBody", {}).get("WFWorkflowActionParameters", {})
    items = health.get("WFFormValues", {}).get("Value", {}).get("WFDictionaryFieldValueItems", [])
    values = {item.get("WFKey", {}).get("Value", {}).get("string"): item.get("WFValue", {}).get("Value", {}) for item in items}
    if values.get("kind", {}).get("string") != "health":
        raise AssertionError("Expected one health upload")
    for field, variable in (("stepsRecent", "stepsField"), ("restingHRRecent", "restingField"), ("hrvRecent", "hrvField"), ("workoutMinRecent", "exerciseField"), ("sleepIntervals", "sleepIntervals")):
        if not refers_to_variable(values.get(field), variable):
            raise AssertionError(f"Health upload field {field} does not send {variable}")
    print("Installed Sync has no import question; saved-key file and the single Health upload verified.")


def check_helper(document, actions) -> None:
    if document.get("WFWorkflowImportQuestions", []):
        raise AssertionError("Even Release must not ask questions when installed")
    urls = [json.dumps(a.get("WFWorkflowActionParameters", {}).get("WFURL", "")) for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl"]
    if not any("release-state?helper=" in url for url in urls):
        raise AssertionError("Even Release does not report its own version")
    if not any("Even-Release.shortcut" in url for url in urls):
        raise AssertionError("Even Release cannot update itself")
    print("Even Release reports its version and can update itself.")


def check(plist_path: Path, helper: bool) -> None:
    with plist_path.open("rb") as stream:
        document = plistlib.load(stream)
    actions = document.get("WFWorkflowActions", [])
    if not isinstance(actions, list):
        raise ValueError("Missing WFWorkflowActions array")
    print(f"Checking {plist_path}")
    if helper:
        check_conditions(actions, HELPER_TEXT, HELPER_NUMBERS)
        check_helper(document, actions)
        return
    check_conditions(actions, SYNC_TEXT, SYNC_NUMBERS)
    check_timestamps_and_records(actions)
    check_connection_and_health(document, actions)
    check_alarms(actions)


if __name__ == "__main__":
    args = sys.argv[1:]
    helper = bool(args) and args[0] == "--helper"
    if helper:
        args = args[1:]
    if len(args) != 1:
        raise SystemExit(__doc__)
    check(Path(args[0]), helper)
