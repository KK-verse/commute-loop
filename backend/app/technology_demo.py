"""Deterministic, isolated judge scenarios for explaining CommuteLoop matching.

These fixtures never create User, CommuteRequest, MatchGroup, or TripInstance rows.
The small directed-road approximation is explicitly illustrative, not live routing.
"""
from __future__ import annotations

from copy import deepcopy
from heapq import heappop, heappush
from itertools import count
from math import isfinite
from typing import Any

from .services import auto_fare, distance_proportional_fares

DEFAULT_WEIGHTS = {
    "time_compatibility": 30.0, "route_overlap_direction": 30.0, "detour": 20.0,
    "pickup_drop_convenience": 10.0, "recurring_schedule": 10.0,
}
WEIGHT_LABELS = {
    "time_compatibility": "Time compatibility",
    "route_overlap_direction": "Route overlap and direction",
    "detour": "Detour",
    "pickup_drop_convenience": "Pickup/drop convenience",
    "recurring_schedule": "Recurring schedule compatibility",
}


def _passenger(pid: str, name: str, origin: str, departure: str, deadline: str,
               vehicle: str, max_detour: int, corridor: str, days: list[int]) -> dict[str, Any]:
    return {
        "id": pid, "name": name, "demo": True, "origin": origin,
        "origin_label": origin.replace("_", " ").title(), "destination": "office",
        "destination_label": "Bellandur IT office" if corridor == "bellandur" else "Manyata Tech Park office",
        "preferred_departure": departure, "arrival_deadline": deadline,
        "preferred_vehicle": vehicle, "max_detour_minutes": max_detour,
        "travel_days": days, "corridor": corridor,
    }


SCENARIOS: dict[str, dict[str, Any]] = {
    "auto": {
        "id": "auto", "title": "Scenario A · Shared auto-rickshaw",
        "subtitle": "Three commuters heading to an IT office near Bellandur",
        "vehicle_label": "Auto-rickshaw", "vehicle_type": "auto", "corridor": "bellandur",
        "destination": {"id": "office", "label": "IT office near Bellandur, Bengaluru", "node": "office"},
        "driver": {"name": "Demo Driver A", "verified": True, "vehicle": "Verified auto-rickshaw",
                   "start": "marathahalli", "start_label": "Marathahalli", "available_from": "07:45",
                   "capacity": 3, "legal_capacity": 3, "travel_days": [0, 1, 2, 3, 4]},
        "passengers": [
            _passenger("a", "Commuter A", "marathahalli", "08:00", "09:00", "auto", 15, "bellandur", [0, 1, 2, 3, 4]),
            _passenger("b", "Commuter B", "kadubeesanahalli", "08:05", "09:00", "auto", 15, "bellandur", [0, 1, 2, 3, 4]),
            _passenger("c", "Commuter C", "panathur", "08:10", "09:00", "auto", 15, "bellandur", [0, 1, 2, 3, 4]),
        ],
        "departure_spread_limit_minutes": 20, "pickup_tolerance_minutes": 10,
        "pickup_cluster_road_limit_km": 16, "stop_dwell_minutes": 1,
        "matching_weights": deepcopy(DEFAULT_WEIGHTS),
        "fares": {"auto_base_fare": 36, "base_km": 2, "auto_per_km": 18,
                  "cab_base_fare": 80, "cab_base_km": 2, "cab_per_km": 24},
        "nodes": [
            {"id": "marathahalli", "label": "Marathahalli", "x": 90, "y": 75},
            {"id": "kadubeesanahalli", "label": "Kadubeesanahalli", "x": 235, "y": 150},
            {"id": "panathur", "label": "Panathur", "x": 360, "y": 215},
            {"id": "office", "label": "Bellandur IT office", "x": 535, "y": 125},
            {"id": "whitefield", "label": "Whitefield", "x": 90, "y": 295},
            {"id": "other_office", "label": "Other office", "x": 535, "y": 325},
        ],
        "edges": [
            ["marathahalli", "kadubeesanahalli", 5.2, 8, "Marathahalli–Kadubeesanahalli corridor"],
            ["kadubeesanahalli", "panathur", 3.6, 6, "Kadubeesanahalli–Panathur link"],
            ["panathur", "office", 4.7, 9, "Panathur–Bellandur corridor"],
            ["marathahalli", "office", 7.0, 13, "ORR southbound direct connector"],
            ["kadubeesanahalli", "office", 8.4, 16, "Kadubeesanahalli–Bellandur connector"],
            ["whitefield", "marathahalli", 15.5, 24, "Whitefield–ORR connector"],
            ["whitefield", "other_office", 6.0, 16, "Whitefield–alternate office connector"],
            ["office", "other_office", 18.0, 36, "Bellandur–alternate office connector"],
        ],
        "recurring_week": [
            {"day": "Monday", "status": "Confirmed"}, {"day": "Tuesday", "status": "Confirmed"},
            {"day": "Wednesday", "status": "Skipped"}, {"day": "Thursday", "status": "Confirmed"},
            {"day": "Friday", "status": "Confirmed"},
        ],
    },
    "cab": {
        "id": "cab", "title": "Scenario B · Shared cab",
        "subtitle": "Four commuters heading to a corporate office near Manyata Tech Park",
        "vehicle_label": "Cab", "vehicle_type": "taxi", "corridor": "manyata",
        "destination": {"id": "office", "label": "Corporate office near Manyata Tech Park, Bengaluru", "node": "office"},
        "driver": {"name": "Demo Driver B", "verified": True, "vehicle": "Eligible verified cab",
                   "start": "hebbal", "start_label": "Hebbal", "available_from": "07:45",
                   "capacity": 4, "legal_capacity": 4, "travel_days": [0, 1, 2, 3, 4]},
        "passengers": [
            _passenger("a", "Commuter A", "hebbal", "08:00", "09:15", "taxi", 20, "manyata", [0, 1, 2, 3, 4]),
            _passenger("b", "Commuter B", "nagawara", "08:05", "09:15", "taxi", 20, "manyata", [0, 1, 2, 3, 4]),
            _passenger("c", "Commuter C", "thanisandra", "08:10", "09:15", "taxi", 20, "manyata", [0, 1, 2, 3, 4]),
            _passenger("d", "Commuter D", "hennur", "08:15", "09:15", "taxi", 20, "manyata", [0, 1, 2, 3, 4]),
        ],
        "departure_spread_limit_minutes": 20, "pickup_tolerance_minutes": 10,
        "pickup_cluster_road_limit_km": 16, "stop_dwell_minutes": 1,
        "matching_weights": deepcopy(DEFAULT_WEIGHTS),
        "fares": {"auto_base_fare": 36, "base_km": 2, "auto_per_km": 18,
                  "cab_base_fare": 80, "cab_base_km": 2, "cab_per_km": 24},
        "nodes": [
            {"id": "hebbal", "label": "Hebbal", "x": 80, "y": 80},
            {"id": "nagawara", "label": "Nagawara", "x": 210, "y": 140},
            {"id": "thanisandra", "label": "Thanisandra", "x": 340, "y": 210},
            {"id": "hennur", "label": "Hennur", "x": 455, "y": 280},
            {"id": "office", "label": "Manyata Tech Park office", "x": 535, "y": 105},
            {"id": "whitefield", "label": "Whitefield", "x": 80, "y": 340},
            {"id": "other_office", "label": "Other office", "x": 535, "y": 355},
        ],
        "edges": [
            ["hebbal", "nagawara", 3.3, 4, "Hebbal–Nagawara link"],
            ["nagawara", "thanisandra", 4.4, 6, "Nagawara–Thanisandra corridor"],
            ["thanisandra", "hennur", 5.0, 8, "Thanisandra–Hennur link"],
            ["hennur", "office", 3.8, 7, "Hennur–Manyata approach"],
            ["hebbal", "office", 6.2, 10, "Hebbal–Manyata direct connector"],
            ["thanisandra", "office", 4.5, 6, "Thanisandra–Manyata connector"],
            ["whitefield", "hebbal", 19.0, 32, "Whitefield–Hebbal connector"],
            ["whitefield", "other_office", 5.0, 14, "Whitefield–alternate office connector"],
            ["office", "other_office", 22.0, 40, "Manyata–alternate office connector"],
        ],
        "recurring_week": [
            {"day": "Monday", "status": "Confirmed"}, {"day": "Tuesday", "status": "Confirmed"},
            {"day": "Wednesday", "status": "Skipped"}, {"day": "Thursday", "status": "Confirmed"},
            {"day": "Friday", "status": "Confirmed"},
        ],
    },
}

STAGE_NAMES = [
    "Commute Requests Received", "Geographic Compatibility Checked", "Time Windows Compared",
    "Route Overlap Analysed", "Vehicle Capacity Validated", "Pickup and Drop Sequence Optimised",
    "Detour Constraints Checked", "Matching Score Calculated", "Proposed Shared Commute Generated",
]


def _minutes(value: str) -> int:
    hour, minute = (int(x) for x in value.split(":"))
    return hour * 60 + minute


def _clock(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def _graph(scenario: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    graph: dict[str, list[dict[str, Any]]] = {n["id"]: [] for n in scenario["nodes"]}
    for edge_id, (start, end, km, minutes, label) in enumerate(scenario["edges"]):
        for a, b in ((start, end), (end, start)):
            graph[a].append({"to": b, "km": float(km), "minutes": int(minutes),
                             "id": f"{min(start, end)}::{max(start, end)}", "label": label,
                             "edge_index": edge_id})
    return graph


def shortest_road_path(scenario: dict[str, Any], start: str, end: str) -> dict[str, Any] | None:
    """Dijkstra on the scenario road graph; optimize travel minutes, then road distance."""
    if start not in _graph(scenario) or end not in _graph(scenario):
        return None
    if start == end:
        return {"nodes": [start], "edges": [], "distance_km": 0.0, "minutes": 0}
    graph = _graph(scenario)
    serial = count()
    queue = [(0, 0.0, next(serial), start)]
    best = {start: (0, 0.0)}
    previous: dict[str, tuple[str, dict[str, Any]]] = {}
    while queue:
        mins, km, _, current = heappop(queue)
        if (mins, km) != best[current]:
            continue
        if current == end:
            break
        for edge in sorted(graph[current], key=lambda x: (x["to"], x["minutes"], x["km"])):
            candidate = (mins + edge["minutes"], round(km + edge["km"], 4))
            if edge["to"] not in best or candidate < best[edge["to"]]:
                best[edge["to"]] = candidate
                previous[edge["to"]] = (current, edge)
                heappush(queue, (*candidate, next(serial), edge["to"]))
    if end not in best:
        return None
    nodes, edges, cursor = [end], [], end
    while cursor != start:
        prior, edge = previous[cursor]
        nodes.append(prior)
        edges.append(edge)
        cursor = prior
    nodes.reverse()
    edges.reverse()
    return {"nodes": nodes, "edges": edges, "distance_km": round(best[end][1], 2), "minutes": best[end][0]}


def _insertion_orders(passengers: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Generate candidate orders by inserting every pickup into each existing route position."""
    orders: list[list[dict[str, Any]]] = [[]]
    for passenger in passengers:
        next_orders: list[list[dict[str, Any]]] = []
        for order in orders:
            for index in range(len(order) + 1):
                next_orders.append(order[:index] + [passenger] + order[index:])
        orders = next_orders
    return orders


def _join_paths(paths: list[dict[str, Any]]) -> dict[str, Any]:
    nodes: list[str] = []
    edges: list[dict[str, Any]] = []
    for path in paths:
        if not nodes:
            nodes.extend(path["nodes"])
        elif path["nodes"]:
            nodes.extend(path["nodes"][1:])
        edges.extend(path["edges"])
    return {"nodes": nodes, "edges": edges,
            "distance_km": round(sum(e["km"] for e in edges), 2),
            "minutes": sum(e["minutes"] for e in edges)}


def _route_candidate(scenario: dict[str, Any], order: list[dict[str, Any]]) -> dict[str, Any] | None:
    driver = scenario["driver"]
    destination = scenario["destination"]["node"]
    departure = max(_minutes(driver["available_from"]), min(_minutes(p["preferred_departure"]) for p in order))
    clock, current = departure, driver["start"]
    legs: list[dict[str, Any]] = []
    stops: list[dict[str, Any]] = []
    pickup_times: dict[str, int] = {}
    pickup_offsets: dict[str, int] = {}
    edge_offset_after_pickup: dict[str, int] = {}
    edge_offset = 0
    for index, passenger in enumerate(order):
        leg = shortest_road_path(scenario, current, passenger["origin"])
        if leg is None:
            return None
        legs.append(leg)
        edge_offset += len(leg["edges"])
        edge_offset_after_pickup[passenger["id"]] = edge_offset
        clock += leg["minutes"]
        requested = _minutes(passenger["preferred_departure"])
        clock = max(clock, requested)
        pickup_times[passenger["id"]] = clock
        pickup_offsets[passenger["id"]] = clock - requested
        stops.append({"type": "pickup", "passenger_id": passenger["id"], "label": passenger["origin_label"],
                      "node": passenger["origin"], "time": _clock(clock), "pickup_order": index + 1,
                      "requested_time": passenger["preferred_departure"],
                      "offset_minutes": pickup_offsets[passenger["id"]]})
        clock += scenario["stop_dwell_minutes"]
        current = passenger["origin"]
    final_leg = shortest_road_path(scenario, current, destination)
    if final_leg is None:
        return None
    legs.append(final_leg)
    clock += final_leg["minutes"]
    office_arrival = clock
    stops.append({"type": "dropoff", "label": scenario["destination"]["label"], "node": destination,
                  "time": _clock(office_arrival)})
    shared_path = _join_paths(legs)
    shared_by_passenger: dict[str, dict[str, Any]] = {}
    for passenger in order:
        pickup_time = pickup_times[passenger["id"]]
        # Passenger distance is the shared-road suffix from their actual pickup to the office.
        suffix_edges = shared_path["edges"][edge_offset_after_pickup[passenger["id"]]:]
        suffix_km = round(sum(edge["km"] for edge in suffix_edges), 2)
        suffix_minutes = sum(edge["minutes"] for edge in suffix_edges)
        shared_minutes = office_arrival - pickup_time
        direct = shortest_road_path(scenario, passenger["origin"], destination)
        if direct is None:
            return None
        shared_by_passenger[passenger["id"]] = {
            "passenger_id": passenger["id"], "direct_distance_km": direct["distance_km"],
            "direct_minutes": direct["minutes"], "passenger_distance_km": suffix_km,
            "shared_minutes": shared_minutes,
            "additional_minutes": shared_minutes - direct["minutes"],
            "time_saved_minutes": direct["minutes"] - shared_minutes,
            "pickup_time": _clock(pickup_time), "arrival_time": _clock(office_arrival),
            "pickup_offset_minutes": pickup_offsets[passenger["id"]],
            "direct_route_nodes": direct["nodes"],
            "overlap_minutes": sum(edge["minutes"] for edge in suffix_edges if edge["id"] in {e["id"] for e in direct["edges"]}),
        }
    max_deadline = min(_minutes(p["arrival_deadline"]) for p in order)
    max_offset = max(pickup_offsets.values(), default=0)
    detour_valid = all(
        shared_by_passenger[p["id"]]["additional_minutes"] <= p["max_detour_minutes"]
        for p in order
    )
    time_valid = max_offset <= scenario["pickup_tolerance_minutes"] and office_arrival <= max_deadline
    return {
        "order": [p["id"] for p in order], "stops": stops, "shared_path": shared_path,
        "pickup_times": pickup_times, "pickup_offsets": pickup_offsets,
        "office_arrival": _clock(office_arrival), "office_arrival_minutes": office_arrival,
        "driver_departure": _clock(departure), "shared_minutes": office_arrival - departure,
        "distance_km": shared_path["distance_km"], "rider_metrics": shared_by_passenger,
        "max_pickup_offset_minutes": max_offset, "detour_valid": detour_valid,
        "time_valid": time_valid, "deadline": _clock(max_deadline),
        "valid": detour_valid and time_valid,
    }


def _compatibility(scenario: dict[str, Any]) -> dict[str, Any]:
    passengers = scenario["passengers"]
    pair_rows = []
    maximum_km = 0.0
    compatible = True
    for i, first in enumerate(passengers):
        for second in passengers[i + 1:]:
            path = shortest_road_path(scenario, first["origin"], second["origin"])
            if path is None:
                pair_rows.append({"from": first["origin_label"], "to": second["origin_label"], "compatible": False, "road_km": None})
                compatible = False
                continue
            maximum_km = max(maximum_km, path["distance_km"])
            pair_ok = path["distance_km"] <= scenario["pickup_cluster_road_limit_km"]
            compatible = compatible and pair_ok
            pair_rows.append({"from": first["origin_label"], "to": second["origin_label"],
                              "compatible": pair_ok, "road_km": path["distance_km"], "road_minutes": path["minutes"],
                              "nodes": path["nodes"]})
    same_destination = len({p["destination"] for p in passengers}) == 1
    same_corridor = len({p["corridor"] for p in passengers}) == 1
    return {"compatible": compatible and same_destination and same_corridor,
            "pairs": pair_rows, "maximum_pickup_road_km": round(maximum_km, 2),
            "road_limit_km": scenario["pickup_cluster_road_limit_km"],
            "same_destination": same_destination, "same_general_direction": same_corridor,
            "destination_labels": sorted({p["destination_label"] for p in passengers}),
            "using": "Shortest paths and corridor labels in the simulated road graph; not straight-line distance."}


def _time_compatibility(scenario: dict[str, Any]) -> dict[str, Any]:
    passengers = scenario["passengers"]
    preferred = [_minutes(p["preferred_departure"]) for p in passengers]
    days = [set(p["travel_days"]) for p in passengers]
    common_days = sorted(set.intersection(*days)) if days else []
    spread = max(preferred) - min(preferred) if preferred else 0
    earliest_deadline = min(_minutes(p["arrival_deadline"]) for p in passengers)
    return {"compatible": spread <= scenario["departure_spread_limit_minutes"] and bool(common_days),
            "preferred_window": {"earliest": _clock(min(preferred)), "latest": _clock(max(preferred)), "spread_minutes": spread},
            "spread_limit_minutes": scenario["departure_spread_limit_minutes"],
            "common_travel_days": common_days, "arrival_deadline": _clock(earliest_deadline),
            "using": "The configured preferred-departure spread and shared weekday set; pickup tolerance and deadline are rechecked on the optimized route."}


def _route_overlap(scenario: dict[str, Any], direct_routes: dict[str, dict[str, Any]]) -> dict[str, Any]:
    edge_users: dict[str, set[str]] = {}
    edge_specs: dict[str, dict[str, Any]] = {}
    for pid, path in direct_routes.items():
        for edge in path["edges"]:
            edge_users.setdefault(edge["id"], set()).add(pid)
            edge_specs[edge["id"]] = edge
    total_passenger_minutes = sum(path["minutes"] for path in direct_routes.values())
    common_passenger_minutes = sum(edge_specs[e]["minutes"] * len(users)
                                   for e, users in edge_users.items() if len(users) > 1)
    overlap_pct = round(100 * common_passenger_minutes / total_passenger_minutes, 1) if total_passenger_minutes else 0
    return {"overlap_percent": overlap_pct, "common_passenger_road_minutes": common_passenger_minutes,
            "total_individual_road_minutes": total_passenger_minutes,
            "compatible": overlap_pct > 0,
            "common_segments": [{"label": edge_specs[e]["label"], "minutes": edge_specs[e]["minutes"],
                                 "used_by": sorted(edge_users[e])}
                                for e in sorted(edge_users) if len(edge_users[e]) > 1],
            "direction_percent": 100 if all(p["destination"] == scenario["destination"]["id"] for p in scenario["passengers"]) else 0,
            "using": "For each shortest individual road route, count the minutes on graph segments also used by another commuter; compare with all individual-route minutes."}


def _score(scenario: dict[str, Any], route: dict[str, Any], overlap: dict[str, Any]) -> dict[str, Any]:
    passengers = scenario["passengers"]
    mean_pickup_offset = sum(route["pickup_offsets"].values()) / len(passengers)
    tolerance = scenario["pickup_tolerance_minutes"]
    time_score = max(0.0, min(100.0, 100 * (1 - mean_pickup_offset / tolerance))) if tolerance else (100.0 if mean_pickup_offset == 0 else 0.0)
    route_score = 0.70 * overlap["overlap_percent"] + 0.30 * overlap["direction_percent"]
    mean_positive_detour = sum(max(0, m["additional_minutes"]) for m in route["rider_metrics"].values()) / len(passengers)
    max_detour = min(p["max_detour_minutes"] for p in passengers)
    detour_score = max(0.0, min(100.0, 100 * (1 - mean_positive_detour / (2 * max_detour)))) if max_detour else (100.0 if mean_positive_detour == 0 else 0.0)
    # Every demo pickup is at the submitted origin and every rider shares the exact submitted office.
    pickup_convenience = 100.0 if all(s["type"] == "pickup" and s["node"] in {p["origin"] for p in passengers} for s in route["stops"] if s["type"] == "pickup") else 0.0
    weekday_union = set().union(*(set(p["travel_days"]) for p in passengers))
    weekday_intersection = set.intersection(*(set(p["travel_days"]) for p in passengers))
    schedule_score = 100 * len(weekday_intersection) / len(weekday_union) if weekday_union else 0.0
    raw_scores = {"time_compatibility": time_score, "route_overlap_direction": route_score,
                  "detour": detour_score, "pickup_drop_convenience": pickup_convenience,
                  "recurring_schedule": schedule_score}
    components = [{"key": key, "label": WEIGHT_LABELS[key], "score": round(raw_scores[key], 1),
                   "weight_percent": scenario["matching_weights"][key]} for key in WEIGHT_LABELS]
    for component in components:
        component["weighted_points"] = round(component["score"] * component["weight_percent"] / 100, 2)
    return {"components": components, "total": round(sum(c["weighted_points"] for c in components), 1),
            "weights_configurable": True,
            "formula": "sum(component score × configured weight percentage ÷ 100).",
            "hard_constraints_gate_score": True}


def _fare_summary(scenario: dict[str, Any], route: dict[str, Any]) -> dict[str, Any]:
    passengers = scenario["passengers"]
    metrics = [route["rider_metrics"][p["id"]] for p in passengers]
    fare_config = scenario["fares"]
    vehicle = scenario["vehicle_type"]
    if vehicle == "auto":
        total_fare = round(auto_fare(route["distance_km"], fare_config["base_km"],
                                     fare_config["auto_base_fare"], fare_config["auto_per_km"]), 2)
        tariff = f"₹{fare_config['auto_base_fare']} for the first {fare_config['base_km']} km + ₹{fare_config['auto_per_km']}/km after"
    else:
        # The repo has no live taxi fare integration. This isolated demo tariff is deliberately disclosed.
        total_fare = round(fare_config["cab_base_fare"] + max(0, route["distance_km"] - fare_config["cab_base_km"]) * fare_config["cab_per_km"], 2)
        tariff = f"Illustrative demo cab tariff: ₹{fare_config['cab_base_fare']} for the first {fare_config['cab_base_km']} km + ₹{fare_config['cab_per_km']}/km after"
    distances = [m["passenger_distance_km"] for m in metrics]
    shares = distance_proportional_fares(distances, total_fare)
    rows = []
    for passenger, metric, share in zip(passengers, metrics, shares):
        direct_cost = (round(auto_fare(metric["direct_distance_km"], fare_config["base_km"],
                                       fare_config["auto_base_fare"], fare_config["auto_per_km"]), 2)
                       if vehicle == "auto" else
                       round(fare_config["cab_base_fare"] + max(0, metric["direct_distance_km"] - fare_config["cab_base_km"]) * fare_config["cab_per_km"], 2))
        rows.append({"passenger_id": passenger["id"], "name": passenger["name"],
                     "direct_distance_km": metric["direct_distance_km"],
                     "shared_passenger_distance_km": metric["passenger_distance_km"],
                     "shared_fare": share, "estimated_direct_fare": direct_cost,
                     "estimated_savings": round(direct_cost - share, 2)})
    return {"total_shared_fare": total_fare, "tariff": tariff, "assumption": "Illustrative only; not a live quote or a claim about actual demand.",
            "formula": "(individual passenger distance / total passenger-distance) × total shared fare",
            "total_passenger_km": round(sum(distances), 2), "rows": rows,
            "shares_sum": round(sum(shares), 2)}


def _public_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    keep = {k: v for k, v in scenario.items() if k not in {"edges", "nodes"}}
    keep["map"] = {"nodes": scenario["nodes"], "routes_simulated": True,
                   "edges": [{"from": edge[0], "to": edge[1]} for edge in scenario["edges"]],
                   "label": "Simulated Bengaluru road graph · not live road distances or traffic"}
    keep["matching_weights"] = [{"key": key, "label": WEIGHT_LABELS[key],
                                 "weight_percent": scenario["matching_weights"][key]} for key in WEIGHT_LABELS]
    return keep


def list_scenarios() -> dict[str, Any]:
    return {"introduction": "CommuteLoop transforms individual daily office journeys into coordinated shared commutes by evaluating route compatibility, departure times, passenger capacity, acceptable detours and office arrival deadlines.",
            "scenarios": [_public_scenario(SCENARIOS[key]) for key in ("auto", "cab")],
            "stages": STAGE_NAMES, "weights_configurable": True,
            "storage": "Fixtures are isolated from real users and operational database records.",
            "routing": "The current app has no live Google Maps or Mapbox route adapter. This judge module uses a deterministic, labelled simulated road graph."}


def _run_failure_test(scenario: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    incompatible = {
        "id": "whitefield", "name": "Sample Commuter E", "demo": True,
        "origin": "whitefield", "origin_label": "Whitefield",
        "destination": "other_office", "destination_label": "Different office, Bengaluru",
        "preferred_departure": "10:30", "arrival_deadline": "10:00",
        "preferred_vehicle": scenario["vehicle_type"], "max_detour_minutes": 20,
        "travel_days": [0, 1, 2, 3, 4], "corridor": "different_destination",
    }
    failed = []
    road = shortest_road_path(scenario, incompatible["origin"], scenario["destination"]["node"])
    if incompatible["destination"] != scenario["destination"]["id"]:
        failed.append({"constraint": "Destination compatibility", "reason": f"The commuter is travelling to {incompatible['destination_label']}, while the group is going to {scenario['destination']['label']}."})
    if not road or road["distance_km"] > scenario["pickup_cluster_road_limit_km"]:
        distance = "no connected road path" if not road else f"{road['distance_km']} road km"
        failed.append({"constraint": "Road-route/geographic compatibility", "reason": f"Whitefield to the group corridor is {distance}; the configured pickup-cluster limit is {scenario['pickup_cluster_road_limit_km']} road km."})
    if incompatible["corridor"] != scenario["corridor"]:
        failed.append({"constraint": "Direction compatibility", "reason": "The sample request is tagged to a different office corridor."})
    if _minutes(incompatible["preferred_departure"]) >= _minutes(incompatible["arrival_deadline"]):
        failed.append({"constraint": "Time/deadline compatibility", "reason": "The 10:30 AM preferred departure is after the 10:00 AM office deadline."})
    elif incompatible["preferred_departure"] > base["route"]["office_arrival"]:
        failed.append({"constraint": "Group pickup window", "reason": "The sample request starts after this group's route has already reached the office."})
    return {"candidate": incompatible, "accepted": False, "failed_constraints": failed,
            "alternative_group_or_driver_found": False,
            "alternative_explanation": "The isolated fixture contains only the displayed verified driver and no alternative route group; the app does not claim an alternative was found."}


def _capacity_test(scenario: dict[str, Any]) -> dict[str, Any]:
    current = len(scenario["passengers"])
    capacity = min(scenario["driver"]["capacity"], scenario["driver"]["legal_capacity"])
    return {"accepted": current + 1 <= capacity, "current_passengers": current,
            "additional_passengers_attempted": 1, "requested_total": current + 1,
            "configured_capacity": scenario["driver"]["capacity"],
            "legal_capacity": scenario["driver"]["legal_capacity"], "effective_capacity": capacity,
            "reason": ("The extra passenger fits within the configured legal capacity." if current + 1 <= capacity
                       else f"{current + 1} requested passengers exceed the effective legal capacity of {capacity}; assignment rejected before scoring.")}


def run_scenario(scenario_id: str, mode: str = "standard", weights: dict[str, float] | None = None) -> dict[str, Any]:
    if scenario_id not in SCENARIOS:
        raise ValueError("Choose the auto or cab scenario.")
    if mode not in {"standard", "incompatible", "capacity"}:
        raise ValueError("Unknown demonstration mode.")
    scenario = deepcopy(SCENARIOS[scenario_id])
    if weights is not None:
        if set(weights) != set(DEFAULT_WEIGHTS):
            raise ValueError("Provide all five matching weight components.")
        numeric_weights = {key: float(value) for key, value in weights.items()}
        if any(not isfinite(value) or value < 0 or value > 100 for value in numeric_weights.values()):
            raise ValueError("Each matching weight must be between 0 and 100.")
        if abs(sum(numeric_weights.values()) - 100.0) > 0.01:
            raise ValueError("Matching weights must add up to 100%.")
        scenario["matching_weights"] = numeric_weights
    passengers, driver = scenario["passengers"], scenario["driver"]
    stages: list[dict[str, Any]] = []

    def stage(index: int, passed: bool, summary: str, details: dict[str, Any], warning: bool = False) -> None:
        stages.append({"index": index + 1, "name": STAGE_NAMES[index],
                       "status": "passed" if passed else ("warning" if warning else "rejected"),
                       "summary": summary, "details": details})

    stage(0, True, f"Received {len(passengers)} separate DEMO commute requests.",
          {"passenger_count": len(passengers), "requests": passengers, "records_written": 0})
    geography = _compatibility(scenario)
    stage(1, geography["compatible"],
          f"{geography['maximum_pickup_road_km']} road km maximum between submitted pickup points; common office and corridor checked.", geography)
    time_check = _time_compatibility(scenario)
    stage(2, time_check["compatible"],
          f"Preferred departure spread is {time_check['preferred_window']['spread_minutes']} minutes; shared travel days are {len(time_check['common_travel_days'])}.", time_check)
    direct_routes = {p["id"]: shortest_road_path(scenario, p["origin"], scenario["destination"]["node"]) for p in passengers}
    all_direct_connected = all(direct_routes.values())
    overlap = _route_overlap(scenario, direct_routes) if all_direct_connected else {"overlap_percent": 0, "direction_percent": 0, "common_segments": [], "using": "No connected road paths."}
    route_overlap_ok = all_direct_connected and geography["same_general_direction"] and overlap.get("compatible", False)
    stage(3, route_overlap_ok,
          f"{overlap['overlap_percent']}% of individual route time is on a graph segment shared by another request.", overlap)
    effective_capacity = min(driver["capacity"], driver["legal_capacity"])
    capacity_ok = len(passengers) <= effective_capacity
    vehicle_preferences_ok = all(p["preferred_vehicle"] in {scenario["vehicle_type"], "any"} for p in passengers)
    driver_ok = driver["verified"] and set(time_check["common_travel_days"]).issubset(driver["travel_days"])
    capacity_detail = {"passengers": len(passengers), "configured_capacity": driver["capacity"],
                       "legal_capacity": driver["legal_capacity"], "effective_capacity": effective_capacity,
                       "vehicle_preferences_compatible": vehicle_preferences_ok,
                       "verified_driver": driver["verified"], "driver_days": driver["travel_days"],
                       "common_days_covered": driver_ok}
    stage(4, capacity_ok and driver_ok and vehicle_preferences_ok,
          f"{len(passengers)} passengers against effective capacity {effective_capacity}; vehicle preference, verification and weekday availability checked.", capacity_detail)

    candidates = [_route_candidate(scenario, order) for order in _insertion_orders(passengers)] if capacity_ok and driver_ok and vehicle_preferences_ok and geography["compatible"] and time_check["compatible"] and route_overlap_ok else []
    candidates = [candidate for candidate in candidates if candidate]
    valid_candidates = [candidate for candidate in candidates if candidate["valid"]]
    valid_candidates.sort(key=lambda c: (c["shared_minutes"], c["distance_km"], c["max_pickup_offset_minutes"], c["order"]))
    selected = valid_candidates[0] if valid_candidates else None
    route_detail = {"insertion_candidates_evaluated": len(candidates), "valid_candidate_count": len(valid_candidates),
                    "objective": "minimum simulated driving-plus-stop minutes, then road distance, then pickup offset",
                    "selected_order": selected["order"] if selected else None,
                    "driver_start": driver["start_label"], "vehicle": driver["vehicle"],
                    "route": selected}
    stage(5, selected is not None,
          (f"Evaluated {len(candidates)} insertion orders; selected the lowest-cost valid order." if selected else
           f"Evaluated {len(candidates)} insertion orders; no route passed pickup-time, deadline and detour constraints."), route_detail)

    detour_pass = selected is not None and selected["detour_valid"]
    deadline_pass = selected is not None and selected["time_valid"]
    stage(6, detour_pass and deadline_pass,
          ("All individual detours and the office arrival deadline are within their configured limits." if detour_pass and deadline_pass
           else "At least one detour or office-arrival constraint failed."),
          {"riders": list(selected["rider_metrics"].values()) if selected else [],
           "office_arrival": selected["office_arrival"] if selected else None,
           "deadline": selected["deadline"] if selected else None})

    hard_constraints_pass = geography["compatible"] and time_check["compatible"] and route_overlap_ok and capacity_ok and driver_ok and vehicle_preferences_ok and selected is not None and detour_pass and deadline_pass
    score = _score(scenario, selected, overlap) if hard_constraints_pass and selected else None
    stage(7, score is not None, (f"Calculated {score['total']}/100 from the five weighted components." if score else "Score withheld because a hard constraint failed."), score or {"hard_constraints_gate_score": True})
    stage(8, hard_constraints_pass,
          (f"{len(passengers)} commuters coordinated into one shared {scenario['vehicle_label'].lower()}." if hard_constraints_pass
           else "No proposed shared commute was created because a hard constraint failed."),
          {"proposed": hard_constraints_pass, "database_records_written": 0})

    fares = _fare_summary(scenario, selected) if hard_constraints_pass and selected else None
    failure = _run_failure_test(scenario, {"route": selected}) if mode == "incompatible" and selected else None
    capacity_failure = _capacity_test(scenario) if mode == "capacity" else None
    node_lookup = {node["id"]: node for node in scenario["nodes"]}
    map_routes = {"shared": selected["shared_path"]["nodes"] if selected else [],
                  "individual": {pid: path["nodes"] for pid, path in direct_routes.items() if path}}
    time_summary = None
    if selected:
        deltas = [metric["time_saved_minutes"] for metric in selected["rider_metrics"].values()]
        time_summary = {"net_minutes_saved": sum(deltas),
                        "riders_with_time_saved": sum(value > 0 for value in deltas),
                        "riders_with_added_time": sum(value < 0 for value in deltas),
                        "formula": "individual direct minutes − shared minutes from pickup; negative means added travel time"}
    return {
        "scenario_id": scenario_id, "mode": mode, "demo": True, "success": hard_constraints_pass,
        "result_message": f"{len(passengers)} commuters successfully coordinated into 1 shared {scenario['vehicle_label'].lower()}." if hard_constraints_pass else "The group was rejected by one or more hard constraints.",
        "scenario": _public_scenario(scenario), "stages": stages,
        "route": selected, "score": score, "fares": fares, "time_summary": time_summary,
        "geography": geography, "time_compatibility": time_check, "route_overlap": overlap,
        "failure_test": failure, "capacity_test": capacity_failure,
        "map": {"nodes": list(node_lookup.values()), "routes": map_routes,
                "selected_order": selected["order"] if selected else [],
                "routes_simulated": True, "label": "Simulated Bengaluru road graph · not live road distances or traffic"},
        "recurring_week": scenario["recurring_week"],
        "configuration": {"pickup_tolerance_minutes": scenario["pickup_tolerance_minutes"],
                          "departure_spread_limit_minutes": scenario["departure_spread_limit_minutes"],
                          "pickup_cluster_road_limit_km": scenario["pickup_cluster_road_limit_km"],
                          "stop_dwell_minutes": scenario["stop_dwell_minutes"],
                          "weights": score["components"] if score else None},
        "records_written": 0,
    }
