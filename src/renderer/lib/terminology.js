// Single source of truth for the Debtor/Client/etc. swap by practice area.
// Bankruptcy uses the formal statutory term "Debtor"; everything else uses
// the generic "Client". Keep this file the only place that knows the rule.

export function personLabel(practiceType) {
  return practiceType === 'bankruptcy' ? 'Debtor' : 'Client';
}

export function personLabelLower(practiceType) {
  return practiceType === 'bankruptcy' ? 'debtor' : 'client';
}

export function practiceAreaLabel(practiceType) {
  switch (practiceType) {
    case 'bankruptcy': return 'Bankruptcy';
    case 'personal_injury': return 'Personal Injury';
    case 'estate_administration': return 'Estate Administration';
    default: return 'General';
  }
}
