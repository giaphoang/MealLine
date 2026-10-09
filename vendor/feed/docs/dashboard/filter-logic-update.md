# Dashboard Filter Logic Update

This document outlines the recent changes to the dashboard's filtering logic, specifically for the "Translation Performance" card.

## Previous State

Previously, the time range filters ("Today", "This Week", "This Month", "This Year") were based on fixed day counts (e.g., "This Month" was "30d"). This caused inconsistencies, such as the "This Month" filter showing data from two different calendar months.

## Current State

The filtering logic has been updated to use calendar-based intervals. The new filter values are:

-   **Today**: Shows data for the current calendar day.
-   **This Week**: Shows data from Sunday to the current day of the current week.
-   **This Month**: Shows data for the current calendar month.
-   **This Year**: Shows data for the current calendar year.

This change ensures that the filter labels accurately reflect the data being displayed.

## Technical Implementation

The frontend now sends more descriptive time range values to the backend (e.g., "this-month" instead of "30d"). The backend's `DateRangeResolver` has been updated to correctly interpret these values and return the appropriate date ranges for database queries.
