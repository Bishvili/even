#!/usr/bin/env python3
"""Check that compiled Apple Shortcuts If actions retain their comparison values.

This inspects the generated property list, not the higher-level Cherri source.
A Shortcut can compile successfully while an If action has no usable right operand.
"""

from __future__ import annotations

import collections
import json
import plistlib
import sys
from pathlib import Path


EXPECTED_TEXT = collections.Counter(
    {"connected": 1, "accepted": 7, "No valid records. Check date, metric values, and event start/end formats": 1, "new_release": 1}
)
EXPECTED_NUMBER = [0, 0] + [1] * 13 + [1440]


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


TIMESTAMP_PATTERN = "yyyy-MM-dd'T'HH:mm:ssZZZZZ"

def check_calendar_timestamps(actions) -> None:
    """Require the compiled form to send full timestamp and timezone offset tokens."""
    named = {
        a.get("WFWorkflowActionParameters", {}).get("CustomOutputName"): a.get("WFWorkflowActionParameters", {})
        for a in actions
    }
    for time_name, event_name in (("startISO", "startDate"), ("endISO", "endDate")):
        item = named.get(time_name)
        if not item:
            raise AssertionError(f"Missing compiled date formatter {time_name}")
        actual = (item.get("WFDateFormatStyle"), item.get("WFTimeFormatStyle"), item.get("WFDateFormat"))
        expected = ("Custom", "None", TIMESTAMP_PATTERN)
        if actual != expected:
            raise AssertionError(f"{time_name} strips event time/zone: {actual}, expected {expected}")
        source = item.get("WFDate", {}).get("Value", {}).get("attachmentsByRange", {}).get("{0, 1}", {})
        if source.get("OutputName") != event_name:
            raise AssertionError(f"{time_name} does not reference {event_name}")

    forms = [
        a.get("WFWorkflowActionParameters", {}).get("WFFormValues", {}).get("Value", {}).get("WFDictionaryFieldValueItems", [])
        for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl"
    ]
    calendar_forms = []
    for form in forms:
        fields = {
            x.get("WFKey", {}).get("Value", {}).get("string"): x.get("WFValue", {}).get("Value", {})
            for x in form
        }
        if fields.get("kind", {}).get("string") == "calendar":
            calendar_forms.append(fields)
    if len(calendar_forms) != 1:
        raise AssertionError(f"Expected one Calendar upload form, found {len(calendar_forms)}")
    fields = calendar_forms[0]
    for field, formatter in (("start", "startISO"), ("end", "endISO")):
        token = fields.get(field, {}).get("attachmentsByRange", {}).get("{0, 1}", {})
        if token.get("OutputName") != formatter or token.get("OutputUUID") != named[formatter].get("UUID"):
            raise AssertionError(f"Calendar form field {field} does not reference {formatter}")
    print("Calendar form sends full ISO date-time with timezone offsets for both event endpoints.")


KEY_FILE = "even-device-key.txt"
STEP_GROUPING_PATTERN = r"(?<=\d)[,\s](?=\d{3}(?:\D|$))"


def check_connection_and_steps(document, actions) -> None:
    if document.get("WFWorkflowImportQuestions", []):
        raise AssertionError("Even Sync cannot ask for a device key when reinstalled")

    named = {
        action.get("WFWorkflowActionParameters", {}).get("CustomOutputName"): action
        for action in actions
    }
    by_id = lambda identifier: [a for a in actions if a.get("WFWorkflowActionIdentifier") == identifier]
    if any("runworkflow" in a.get("WFWorkflowActionIdentifier", "") for a in actions):
        raise AssertionError("Even Sync must not depend on another Shortcut")

    for finder, count, types in (("is.workflow.actions.filter.calendarevents", 1, [None]), ("is.workflow.actions.filter.health.quantity", 7, ["Steps", "Steps", "Resting Heart Rate", "Heart Rate", "Heart Rate Variability", "Exercise Minutes", "Sleep"])):
        found = by_id(finder)
        if len(found) != count:
            raise AssertionError(f"Expected {count} {finder} actions, found {len(found)}")
        for action, expected_type in zip(found, types):
            template = action["WFWorkflowActionParameters"].get("WFContentItemFilter", {})
            if template.get("WFSerializationType") != "WFContentPredicateTableTemplate":
                raise AssertionError(f"{finder} filter is not in Apple's filter format and would be ignored")
            rows = template["Value"]["WFActionParameterFilterTemplates"]
            actual = rows[0]["Values"]["Enumeration"]["Value"] if expected_type else None
            if actual != expected_type:
                raise AssertionError(f"Expected filter type {expected_type}, found {actual}")

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
    total_input = json.dumps(total_settings.get("Input", {}))
    if total.get("WFWorkflowActionIdentifier") != "is.workflow.actions.statistics" or total_settings.get("WFStatisticsOperation") != "Sum" or '"values"' not in total_input:
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

    health = named.get("healthBody", {}).get("WFWorkflowActionParameters", {})
    fields = health.get("WFFormValues", {}).get("Value", {}).get("WFDictionaryFieldValueItems", [])
    values = {
        field.get("WFKey", {}).get("Value", {}).get("string"):
        field.get("WFValue", {}).get("Value", {})
        for field in fields
    }
    if values.get("kind", {}).get("string") != "health":
        raise AssertionError("Expected health ingestion form")
    steps = values.get("steps", {}).get("attachmentsByRange", {}).get("{0, 1}", {})
    extractor = named.get("stepsValue", {}).get("WFWorkflowActionParameters", {})
    extractor_input = extractor.get("WFInput", {}).get("Value", {}).get("attachmentsByRange", {}).get("{0, 1}", {})
    if extractor.get("WFReplaceTextReplace") != "$1" or not extractor.get("WFReplaceTextRegularExpression") or extractor_input.get("OutputName") != "normalizedSteps":
        raise AssertionError("Step number extraction is missing or malformed")
    if steps.get("OutputName") != "stepsValue" or steps.get("OutputUUID") != extractor.get("UUID"):
        raise AssertionError("Health form does not use the normalized numeric step value")
    print("Installed Sync has no import question; saved-key file and numeric Health fields verified.")


def check(plist_path: Path) -> None:
    with plist_path.open("rb") as stream:
        document = plistlib.load(stream)
    actions = document.get("WFWorkflowActions", [])
    if not isinstance(actions, list):
        raise ValueError("Missing WFWorkflowActions array")

    observed = []
    for index, action in enumerate(actions):
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        params = action.get("WFWorkflowActionParameters", {})
        if params.get("WFControlFlowMode") != 0:
            continue
        for kind, value, operator in operands(params):
            observed.append({"action": index, "kind": kind, "value": value, "operator": operator})

    print(json.dumps({"plist": str(plist_path), "conditions": observed}, indent=2))
    if len(observed) != 26:
        raise AssertionError(f"Expected twenty-six If comparisons, found {len(observed)}")

    missing = [row for row in observed if row["kind"] == "missing" or row["value"] == ""]
    if missing:
        raise AssertionError(f"If conditions missing right operands: {missing}")

    texts = collections.Counter(row["value"] for row in observed if row["kind"] == "text")
    numbers = [row["value"] for row in observed if row["kind"] == "number"]
    if texts != EXPECTED_TEXT:
        raise AssertionError(f"Unexpected text operands: {texts}; expected {EXPECTED_TEXT}")
    if sorted(float(n) for n in numbers) != EXPECTED_NUMBER:
        raise AssertionError(f"Expected numeric thresholds 0 and 1, got {numbers}")
    check_calendar_timestamps(actions)
    check_connection_and_steps(document, actions)
    print("All twenty-six If comparisons have explicit, expected right-hand values.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: check-shortcut-conditions.py <compiled.plist>")
    check(Path(sys.argv[1]))
