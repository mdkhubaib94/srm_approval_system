"""Re-nests/flattens the detail-model field groups the original Mongoose
schemas nested (e.g. `financials.mainEquipmentCost`) but this codebase's
Postgres columns flatten (`main_equipment_cost`). The migration flattened
storage but the frontend still reads/writes the original nested shape, so
this is the translation layer between them — used on the way in
(create/update payloads) and the way out (serialize_request's `details`).

GROUP_MAPPINGS[details_model] maps a flat column name to (group_key, leaf_key)
for every field the source nested. Any column not listed here is flat in
both shapes; its own key just goes through the ordinary
snake_to_camel/camel_to_snake conversion.
"""

from app.core.case_conversion import camel_to_snake, snake_to_camel

GROUP_MAPPINGS: dict[str, dict[str, tuple[str, str]]] = {
    "MouDetail": {
        "validity_from": ("validity", "from"),
        "validity_to": ("validity", "to"),
        "industrial_visits_count": ("historicalMetrics", "industrialVisitsCount"),
        "internships_paid": ("historicalMetrics", "internshipsPaid"),
        "internships_unpaid": ("historicalMetrics", "internshipsUnpaid"),
        "placement_offers_count": ("historicalMetrics", "placementOffersCount"),
        "has_collaborative_project": ("historicalMetrics", "hasCollaborativeProject"),
        "has_guest_lectures_conducted": ("historicalMetrics", "hasGuestLecturesConducted"),
        "has_sponsorships_provided": ("historicalMetrics", "hasSponsorshipsProvided"),
        "revenue_generated": ("historicalMetrics", "revenueGenerated"),
    },
    "GuestLectureDetail": {
        "schedule_date": ("schedule", "date"),
        "schedule_time": ("schedule", "time"),
        "schedule_duration": ("schedule", "duration"),
        "criteria_aligned": ("accreditationMapping", "criteriaAligned"),
        "satisfies_sdg_or_iks": ("accreditationMapping", "satisfiesSdgOrIks"),
        "sdg_iks_details": ("accreditationMapping", "sdgIksDetails"),
        "iqac_target_for_year": ("iqacMetrics", "targetForYear"),
        "iqac_conducted_so_far": ("iqacMetrics", "conductedSoFar"),
    },
    "EquipmentPurchaseDetail": {
        "main_equipment_cost": ("financials", "mainEquipmentCost"),
        "ancillary_equipment_cost": ("financials", "ancillaryEquipmentCost"),
        "landed_cost_total": ("financials", "landedCostTotal"),
        "estimated_monthly_running_cost": ("financials", "estimatedMonthlyRunningCost"),
        "previous_supplier_name": ("previousPurchase", "supplierName"),
        "previous_po_number": ("previousPurchase", "poNumber"),
        "previous_purchase_date": ("previousPurchase", "purchaseDate"),
        "previous_price_paid": ("previousPurchase", "pricePaid"),
        "previous_life_span_expected": ("previousPurchase", "lifeSpanExpected"),
        "cross_dept_available": ("crossDepartmentAvailability", "availableInOtherDept"),
        "cross_dept_requirement_clearance": ("crossDepartmentAvailability", "requirementAndClearance"),
        "cross_dept_purchase_date": ("crossDepartmentAvailability", "dateOfPurchase"),
        "cross_dept_cost": ("crossDepartmentAvailability", "cost"),
        "cross_dept_utilization_pct": ("crossDepartmentAvailability", "percentageOfUtilization"),
    },
    "MaintenanceDetail": {
        "previous_fault_date_month": ("previousFaultMetrics", "dateAndMonthOfPreviousFault"),
        "previous_fault_reason": ("previousFaultMetrics", "reasonForFault"),
    },
    "SeminarParticipationDetail": {
        "duration_from": ("duration", "from"),
        "duration_to": ("duration", "to"),
        "expenses_india_registration_fees": ("expensesIncurredIndia", "registrationFees"),
        "expenses_india_travel_allowance": ("expensesIncurredIndia", "travelAllowance"),
        "expenses_india_stay_accommodation": ("expensesIncurredIndia", "stayAndAccommodation"),
        "expenses_india_total": ("expensesIncurredIndia", "total"),
        "expenses_abroad_registration_fees": ("expensesIncurredAbroad", "registrationFees"),
        "expenses_abroad_travel_allowance": ("expensesIncurredAbroad", "travelAllowance"),
        "expenses_abroad_stay_accommodation": ("expensesIncurredAbroad", "stayAndAccommodation"),
        "expenses_abroad_other_funding_agency_arrangements": ("expensesIncurredAbroad", "otherFundingAgencyArrangements"),
        "historical_seminar_count": ("historicalAttendedCount", "seminar"),
        "historical_workshop_count": ("historicalAttendedCount", "workshop"),
        "historical_conference_national_count": ("historicalAttendedCount", "conferenceNational"),
        "historical_conference_international_count": ("historicalAttendedCount", "conferenceInternational"),
        "historical_paper_presentation_count": ("historicalAttendedCount", "paperPresentation"),
    },
    "SeminarHostingDetail": {
        "schedule_from": ("schedule", "from"),
        "schedule_to": ("schedule", "to"),
        "exp_posters_and_brochures": ("expenditureBreakdown", "postersAndBrochures"),
        "exp_invitations_and_certificates": ("expenditureBreakdown", "invitationsAndCertificates"),
        "exp_prizes": ("expenditureBreakdown", "prizes"),
        "exp_mementos": ("expenditureBreakdown", "mementos"),
        "exp_gifts_to_judges": ("expenditureBreakdown", "giftsToJudges"),
        "exp_gifts_to_chief_guest": ("expenditureBreakdown", "giftsToChiefGuest"),
        "exp_gifts_to_others": ("expenditureBreakdown", "giftsToOthers"),
        "exp_refreshments_chief_guest": ("expenditureBreakdown", "refreshmentsChiefGuest"),
        "exp_refreshments_participants": ("expenditureBreakdown", "refreshmentsParticipants"),
        "exp_conference_kit": ("expenditureBreakdown", "conferenceKit"),
        "exp_decoration": ("expenditureBreakdown", "decoration"),
        "exp_miscellaneous": ("expenditureBreakdown", "miscellaneous"),
        "receipts_registration_fees": ("expectedReceipts", "registrationFees"),
        "receipts_sponsorships": ("expectedReceipts", "sponsorships"),
        "receipts_statutory_grants": ("expectedReceipts", "statutoryGrants"),
        "receipts_other_receipts": ("expectedReceipts", "otherReceipts"),
    },
    "MachineRepairDetail": {
        "nature_of_problem": ("breakdownDetails", "natureOfProblem"),
        "not_working_since": ("breakdownDetails", "notWorkingSince"),
        "reported_on": ("breakdownDetails", "reportedOn"),
        "reported_to_whom": ("breakdownDetails", "reportedToWhom"),
        "number_of_times_repaired_previously": ("breakdownDetails", "numberOfTimesRepairedPreviously"),
        "amount_spent_so_far_on_repairs": ("breakdownDetails", "amountSpentSoFarOnRepairs"),
        "current_repair_estimate": ("breakdownDetails", "currentRepairEstimate"),
        "is_under_amc": ("amcDetails", "isUnderAmc"),
        "amc_periodicity": ("amcDetails", "periodicity"),
        "amc_company_name": ("amcDetails", "companyName"),
        "amc_address": ("amcDetails", "address"),
        "amc_contact_person": ("amcDetails", "contactPerson"),
        "amc_contact_mobile": ("amcDetails", "contactMobile"),
        "amc_commencement_date": ("amcDetails", "commencementDate"),
        "amc_expiry_date": ("amcDetails", "expiryDate"),
    },
    "GeneralDetail": {
        "target_dates_from": ("targetDates", "from"),
        "target_dates_to": ("targetDates", "to"),
        "target_dates_total_days": ("targetDates", "totalDays"),
    },
    "DiscontinuedStudentDetail": {
        "father_name": ("parentDetails", "fatherName"),
        "mother_name": ("parentDetails", "motherName"),
        "last_date_of_class_attended": ("attendanceRecords", "lastDateOfClassAttended"),
        "number_of_days_attended": ("attendanceRecords", "numberOfDaysAttended"),
        "attendance_percentage": ("attendanceRecords", "attendancePercentage"),
        "class_coordinator_signature_date": ("attendanceRecords", "classCoordinatorSignatureDate"),
        "arrear_sem1": ("academicArrearMatrix", "sem1"),
        "arrear_sem2": ("academicArrearMatrix", "sem2"),
        "arrear_sem3": ("academicArrearMatrix", "sem3"),
        "arrear_sem4": ("academicArrearMatrix", "sem4"),
        "arrear_sem5": ("academicArrearMatrix", "sem5"),
        "arrear_sem6": ("academicArrearMatrix", "sem6"),
        "hostel_warden_cleared": ("clearanceSignoffs", "hostelWardenCleared"),
        "librarian_cleared": ("clearanceSignoffs", "librarianCleared"),
        "student_counsellor_cleared": ("clearanceSignoffs", "studentCounsellorCleared"),
        "accounts_outstanding_balance": ("clearanceSignoffs", "accountsOutstandingBalance"),
        "remaining_fees_to_be_collected": ("managerOfficeChecks", "remainingFeesToBeCollected"),
        "tc_issuance_authorized": ("managerOfficeChecks", "tcIssuanceAuthorized"),
    },
    "FeesConcessionDetail": {
        "prizes_won_previous_year": ("achievementsGrid", "prizesWonPreviousYear"),
        "current_year_performance_details": ("achievementsGrid", "currentYearPerformanceDetails"),
        "total_cgpa": ("academicPerformance", "totalCGPA"),
        "attendance_excluding_od": ("academicPerformance", "attendanceExcludingOD"),
        "pass_percentage_cgpa": ("academicPerformance", "passPercentageCGPA"),
        "arrears_sem1": ("academicPerformance", "arrearsSem1"),
        "arrears_sem2": ("academicPerformance", "arrearsSem2"),
        "arrears_sem3": ("academicPerformance", "arrearsSem3"),
        "arrears_sem4": ("academicPerformance", "arrearsSem4"),
        "arrears_sem5": ("academicPerformance", "arrearsSem5"),
        "arrears_sem6": ("academicPerformance", "arrearsSem6"),
        "total_arrears_as_on_date": ("academicPerformance", "totalArrearsAsOnDate"),
        "original_concession_given_by_whom": ("originalConcession", "givenByWhom"),
        "original_concession_referred_contact_person": ("originalConcession", "referredContactPerson"),
        "original_concession_contact_number": ("originalConcession", "contactNumber"),
    },
    "NonBudgetedAssetDetail": {
        "incharge_name": ("respectiveIncharge", "name"),
        "incharge_designation": ("respectiveIncharge", "designation"),
        "main_equipment_cost": ("financials", "mainEquipmentCost"),
        "ancillary_equipment_cost": ("financials", "ancillaryEquipmentCost"),
        "landed_cost": ("financials", "landedCost"),
        "monthly_running_cost": ("financials", "monthlyRunningCost"),
        "previous_supplier_name": ("previousPurchaseHistory", "supplierName"),
        "previous_purchase_date": ("previousPurchaseHistory", "purchaseDate"),
        "previous_price_paid": ("previousPurchaseHistory", "pricePaid"),
        "previous_expected_lifespan": ("previousPurchaseHistory", "expectedLifespan"),
        "is_space_available": ("infrastructureCheck", "isSpaceAvailable"),
        "is_available_in_other_dept": ("infrastructureCheck", "isAvailableInOtherDept"),
        "other_dept_cost_and_utilization": ("infrastructureCheck", "otherDeptCostAndUtilization"),
    },
    "UnexpectedExpenseDetail": {},
    "ITPurchaseDetail": {
        "main_equipment_cost": ("financials", "mainEquipmentCost"),
        "ancillary_equipment_cost": ("financials", "ancillaryEquipmentCost"),
        "landed_cost_total": ("financials", "landedCostTotal"),
        "estimated_monthly_running_cost": ("financials", "estimatedMonthlyRunningCost"),
        "previous_supplier_name": ("previousPurchase", "supplierName"),
        "previous_po_number": ("previousPurchase", "poNumber"),
        "previous_purchase_date": ("previousPurchase", "purchaseDate"),
        "previous_price_paid": ("previousPurchase", "pricePaid"),
        "previous_life_span_expected": ("previousPurchase", "lifeSpanExpected"),
        "cross_dept_available": ("crossDepartmentAvailability", "availableInOtherDept"),
        "cross_dept_requirement_clearance": ("crossDepartmentAvailability", "requirementAndClearance"),
        "cross_dept_purchase_date": ("crossDepartmentAvailability", "dateOfPurchase"),
        "cross_dept_cost": ("crossDepartmentAvailability", "cost"),
        "cross_dept_utilization_pct": ("crossDepartmentAvailability", "percentageOfUtilization"),
    },
    "RecurringExpenditureDetail": {},
}


def flatten_detail_payload(details_model: str, payload: dict) -> dict:
    """Nested-camelCase (or flat-camelCase, or already-flat-snake_case) input
    -> flat snake_case columns. Safe on every shape: a key that names a known
    group is unpacked field-by-field; anything else is treated as an
    already-flat field and just case-converted (a no-op for snake_case keys,
    so this codebase's own flat test payloads pass through unchanged).
    """
    if not isinstance(payload, dict):
        return payload

    group_map = GROUP_MAPPINGS.get(details_model, {})
    # group name -> {leaf_key: flat_column}
    by_group: dict[str, dict[str, str]] = {}
    for flat_column, (group, leaf) in group_map.items():
        by_group.setdefault(group, {})[leaf] = flat_column

    flat: dict = {}
    for key, value in payload.items():
        if key in by_group and isinstance(value, dict):
            leaf_map = by_group[key]
            for leaf_key, leaf_value in value.items():
                flat_column = leaf_map.get(leaf_key)
                if flat_column is not None:
                    flat[flat_column] = leaf_value
                else:
                    flat[camel_to_snake(leaf_key)] = leaf_value
        elif isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            # e.g. indentDetails: [{serialNumber, productId, ...}, ...] — not a
            # nested group, but each row's own keys still arrive camelCased.
            flat[camel_to_snake(key)] = [{camel_to_snake(k): v for k, v in item.items()} for item in value]
        else:
            flat[camel_to_snake(key)] = value
    return flat


def nest_detail_dict(details_model: str, flat: dict) -> dict:
    """The inverse of flatten_detail_payload: a flat snake_case column dict
    (as produced by model_to_dict) -> the nested-camelCase shape the
    frontend reads."""
    group_map = GROUP_MAPPINGS.get(details_model, {})

    nested: dict = {}
    for key, value in flat.items():
        if key in group_map:
            group, leaf = group_map[key]
            nested.setdefault(group, {})[leaf] = value
        else:
            nested[snake_to_camel(key)] = value
    return nested
