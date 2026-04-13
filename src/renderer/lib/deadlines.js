// Statutory deadline engine for consumer bankruptcy cases.
//
// Pure function: given a case object (with at least chapter, status, and
// filed_at or its equivalent), returns a list of deadlines — past, upcoming,
// and overdue — suitable for rendering in the case detail and a firm-wide
// "upcoming deadlines" panel.
//
// Statutory basis (consumer bankruptcy):
// - 341 meeting of creditors: 21-40 days after filing (Chapter 7 typically
//   ~30 days; Chapter 13 ~21-50 days depending on district).
// - Objections to discharge deadline: 60 days after 341 meeting.
// - Discharge: typically ~60-90 days after 341 in Chapter 7 (no objections
//   filed). Chapter 13 discharge is after plan completion (3-5 years).
// - Plan confirmation hearing (Chapter 13): ~45 days after filing.
// - Debtor education / financial mgmt course: before discharge (no hard
//   court deadline — we use 60 days after filing as a practical target).
//
// These are targets/ranges, not per-district exact rules. For a real
// production deadline engine we'd want a district-specific rules table.

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setTime(d.getTime() + days * DAY_MS);
  return d.toISOString();
}

/**
 * Compute statutory deadlines for a single case.
 * Returns [] if the case isn't filed yet (no deadlines are triggered
 * without a filing date).
 *
 * @param {object} caseData - must include `chapter`, `status`, and `filed_at`
 * @param {string} [now] - ISO date to compare against (for testability)
 * @returns {Array<{
 *   key: string,
 *   label: string,
 *   date: string,                 // ISO
 *   rangeEnd?: string,            // ISO, for deadlines that span a range
 *   daysFromNow: number,          // negative = past
 *   status: 'overdue' | 'upcoming' | 'past' | 'completed',
 *   description: string,
 *   severity: 'critical' | 'high' | 'medium' | 'info',
 * }>}
 */
function computeDeadlines(caseData, now = new Date().toISOString()) {
  if (!caseData || !caseData.filed_at) return [];

  const filed = caseData.filed_at;
  const chapter = caseData.chapter || 7;
  const nowTime = new Date(now).getTime();

  const rows = [];

  // 341 meeting of creditors — all chapters
  const meetingStart = addDays(filed, 21);
  const meetingEnd = addDays(filed, chapter === 13 ? 50 : 40);
  rows.push({
    key: '341_meeting',
    label: '341 Meeting of Creditors',
    date: meetingStart,
    rangeEnd: meetingEnd,
    description: 'Debtor must attend the meeting of creditors. Typically scheduled 21-40 days after filing.',
    severity: 'critical',
  });

  if (chapter === 7) {
    // Objection to discharge: 60 days after 341
    rows.push({
      key: 'objection_deadline',
      label: 'Deadline to Object to Discharge',
      date: addDays(meetingEnd, 60),
      description: 'Creditors have 60 days after the 341 meeting to object to discharge.',
      severity: 'high',
    });

    // Expected discharge — no hard deadline, but within 60-90 days after 341
    // if no objections filed.
    rows.push({
      key: 'expected_discharge',
      label: 'Expected Discharge',
      date: addDays(meetingEnd, 60),
      rangeEnd: addDays(meetingEnd, 90),
      description: 'Chapter 7 discharge typically granted 60-90 days after 341 meeting if no objections.',
      severity: 'info',
    });
  }

  if (chapter === 13) {
    // Plan confirmation hearing: ~45 days after filing
    rows.push({
      key: 'plan_confirmation',
      label: 'Plan Confirmation Hearing',
      date: addDays(filed, 45),
      description: 'Court must hold a hearing on plan confirmation within 45 days of filing (11 U.S.C. § 1324).',
      severity: 'critical',
    });

    // First plan payment: due within 30 days of filing under § 1326(a)(1)
    rows.push({
      key: 'first_plan_payment',
      label: 'First Plan Payment Due',
      date: addDays(filed, 30),
      description: 'Debtor must make first plan payment within 30 days of filing.',
      severity: 'high',
    });
  }

  // Financial management course — required before discharge. Use a
  // practical target of 60 days post-filing.
  rows.push({
    key: 'financial_mgmt_course',
    label: 'Financial Management Course',
    date: addDays(filed, 60),
    description: 'Debtor must complete a financial management course before discharge is granted.',
    severity: 'medium',
  });

  // Annotate each deadline with status + days from now.
  return rows.map(r => {
    const dateTime = new Date(r.date).getTime();
    const daysFromNow = Math.round((dateTime - nowTime) / DAY_MS);
    const endTime = r.rangeEnd ? new Date(r.rangeEnd).getTime() : dateTime;

    let status;
    if (caseData.status === 'discharged' || caseData.status === 'closed') {
      status = 'completed';
    } else if (nowTime > endTime) {
      status = 'past';
    } else if (nowTime > dateTime) {
      // Inside the range (e.g. 341 window is open)
      status = 'upcoming';
    } else if (daysFromNow < 0) {
      status = 'overdue';
    } else {
      status = 'upcoming';
    }

    return { ...r, daysFromNow, status };
  });
}

/**
 * Firm-wide: given a list of cases (with filed_at), return a flat list of
 * all upcoming deadlines across cases, sorted ascending.
 * Used on the dashboard.
 */
function computeUpcomingDeadlines(cases, now = new Date().toISOString(), limit = 15) {
  const out = [];
  for (const c of cases) {
    if (!c.filed_at) continue;
    const ds = computeDeadlines(c, now);
    for (const d of ds) {
      if (d.status === 'upcoming' || d.status === 'overdue') {
        out.push({
          ...d,
          case_id: c.id,
          debtor_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
          chapter: c.chapter,
        });
      }
    }
  }
  out.sort((a, b) => new Date(a.date) - new Date(b.date));
  return out.slice(0, limit);
}

module.exports = { computeDeadlines, computeUpcomingDeadlines, addDays };
