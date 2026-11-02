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
    {"connected": 1, "accepted": 2, "No valid records. Check date, metric values, and event start/end formats": 1, "new_release": 1, "Install update": 1}
)
EXPECTED_NUMBER = [1]


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
    if len(observed) != 7:
        raise AssertionError(f"Expected seven If comparisons, found {len(observed)}")

    missing = [row for row in observed if row["kind"] == "missing" or row["value"] == ""]
    if missing:
        raise AssertionError(f"If conditions missing right operands: {missing}")

    texts = collections.Counter(row["value"] for row in observed if row["kind"] == "text")
    numbers = [row["value"] for row in observed if row["kind"] == "number"]
    if texts != EXPECTED_TEXT:
        raise AssertionError(f"Unexpected text operands: {texts}; expected {EXPECTED_TEXT}")
    if len(numbers) != 1 or float(numbers[0]) != EXPECTED_NUMBER[0]:
        raise AssertionError(f"Expected numeric threshold 1, got {numbers}")
    check_calendar_timestamps(actions)
    print("All seven If comparisons have explicit, expected right-hand values.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: check-shortcut-conditions.py <compiled.plist>")
    check(Path(sys.argv[1]))
