from app.technology_demo import list_scenarios, run_scenario


def assert_valid_share(result, expected_people, expected_candidates):
    assert result["success"] is True
    assert result["records_written"] == 0
    assert result["route"] is not None
    assert len(result["route"]["order"]) == expected_people
    assert result["stages"][5]["details"]["insertion_candidates_evaluated"] == expected_candidates
    assert result["score"]["total"] == round(sum(x["weighted_points"] for x in result["score"]["components"]), 1)
    assert [x["weight_percent"] for x in result["score"]["components"]] == [30, 30, 20, 10, 10]
    assert result["fares"]["shares_sum"] == result["fares"]["total_shared_fare"]
    assert result["route"]["office_arrival"] <= result["route"]["deadline"]
    assert all(r["additional_minutes"] <= result["scenario"]["passengers"][i]["max_detour_minutes"]
               for i, r in enumerate(result["route"]["rider_metrics"].values()))


def test_auto_scenario_optimizes_three_passengers_and_distributes_fare():
    result = run_scenario("auto")
    assert_valid_share(result, expected_people=3, expected_candidates=6)
    assert result["route"]["order"] == ["a", "b", "c"]
    assert result["route"]["office_arrival"] == "08:26"
    assert result["route"]["rider_metrics"]["a"]["additional_minutes"] == 13
    assert result["fares"]["total_shared_fare"] == 243.0
    assert result["fares"]["rows"][0]["estimated_savings"] > 0


def test_cab_scenario_optimizes_four_passengers_and_respects_capacity():
    result = run_scenario("cab")
    assert_valid_share(result, expected_people=4, expected_candidates=24)
    assert result["route"]["order"] == ["a", "b", "c", "d"]
    assert result["route"]["office_arrival"] == "08:29"
    assert result["scenario"]["driver"]["legal_capacity"] == 4
    assert all(row["estimated_savings"] >= 0 for row in result["fares"]["rows"])


def test_incompatible_whitefield_request_is_rejected_with_reasons():
    result = run_scenario("auto", "incompatible")
    rejected = result["failure_test"]
    assert result["success"] is True  # the original group remains valid
    assert rejected["accepted"] is False
    names = {failure["constraint"] for failure in rejected["failed_constraints"]}
    assert {"Destination compatibility", "Road-route/geographic compatibility", "Direction compatibility",
            "Time/deadline compatibility"}.issubset(names)
    assert rejected["alternative_group_or_driver_found"] is False
    assert rejected["candidate"]["demo"] is True
    assert result["records_written"] == 0


def test_full_vehicle_rejects_one_additional_passenger():
    result = run_scenario("cab", "capacity")
    capacity = result["capacity_test"]
    assert result["success"] is True
    assert capacity["accepted"] is False
    assert capacity["requested_total"] == 5
    assert capacity["effective_capacity"] == 4
    assert "assignment rejected" in capacity["reason"]


def test_recurring_schedule_is_five_separate_fixture_rows():
    result = run_scenario("auto")
    assert [(day["day"], day["status"]) for day in result["recurring_week"]] == [
        ("Monday", "Confirmed"), ("Tuesday", "Confirmed"), ("Wednesday", "Skipped"),
        ("Thursday", "Confirmed"), ("Friday", "Confirmed"),
    ]
    assert result["records_written"] == 0
    assert "DEMO" in list_scenarios()["scenarios"][0]["passengers"][0]["name"] or list_scenarios()["scenarios"][0]["passengers"][0]["demo"] is True


def test_matching_weights_are_configurable_and_returned_in_score():
    weights = {
        "time_compatibility": 20,
        "route_overlap_direction": 20,
        "detour": 30,
        "pickup_drop_convenience": 10,
        "recurring_schedule": 20,
    }
    result = run_scenario("auto", weights=weights)
    assert result["success"] is True
    assert {row["key"]: row["weight_percent"] for row in result["score"]["components"]} == weights
    assert sum(row["weight_percent"] for row in result["score"]["components"]) == 100
    assert result["configuration"]["weights"] == result["score"]["components"]
    assert "initial weights" not in result["score"]["formula"]


def test_matching_weight_validation_rejects_non_totaling_configuration():
    import pytest

    with pytest.raises(ValueError, match="add up to 100"):
        run_scenario("auto", weights={
            "time_compatibility": 30,
            "route_overlap_direction": 30,
            "detour": 20,
            "pickup_drop_convenience": 10,
            "recurring_schedule": 5,
        })
