// Mirror of backend app/users/constants.py INSTITUTION_GROUPS — keep in sync.
// Users in a pooled role can see/act on requests from every institution in
// their group. Other roles (and institutions outside any group) match exactly.
const SRMIST_AND_DENTAL = [
  "SRMIST - E&T",
  "SRMIST - FSH",
  "SRMIST - Management",
  "SRMIST - SEAD",
  "DENTAL",
];

export const INSTITUTION_GROUPS = {
  INSTITUTION_MANAGER: [
    ["SRMIST - E&T", "SRMIST - SEAD"],
    ["SRMIST - Management", "SRMIST - FSH"],
  ],
  ACCOUNTANT: [SRMIST_AND_DENTAL, ["EEC", "SRM Nightingale School"]],
};

export function sameInstitution(requestInstitution, userInstitution, role) {
  if (requestInstitution === userInstitution) return true;
  const groups = INSTITUTION_GROUPS[role] || [];
  return groups.some(
    (g) => g.includes(requestInstitution) && g.includes(userInstitution)
  );
}
