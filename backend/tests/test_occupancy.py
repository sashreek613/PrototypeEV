from app.engines.occupancy import occupancy_view


def test_case_1_none_available() -> None:
    view = occupancy_view(physical_status="AVAILABLE", booking_state="NONE")
    assert view.occupancy == "AVAILABLE"
    assert view.unexpected_occupancy is False


def test_case_2_none_charging_occupied() -> None:
    view = occupancy_view(physical_status="CHARGING", booking_state="NONE")
    assert view.occupancy == "OCCUPIED"
    assert view.unexpected_occupancy is True
    assert "currently charging" in view.driver_message.lower()
    assert view.operator_message is not None
    assert "unexpected" in view.operator_message.lower()


def test_case_3_reserved_available() -> None:
    view = occupancy_view(physical_status="AVAILABLE", booking_state="RESERVED")
    assert view.occupancy == "RESERVED"


def test_case_4_none_faulted_unavailable() -> None:
    view = occupancy_view(physical_status="FAULTED", booking_state="NONE")
    assert view.occupancy == "UNAVAILABLE"


def test_case_5_reserved_charging_conflict() -> None:
    view = occupancy_view(physical_status="CHARGING", booking_state="RESERVED")
    assert view.occupancy == "OCCUPIED"
    assert view.conflict is True
    assert view.unexpected_occupancy is False
