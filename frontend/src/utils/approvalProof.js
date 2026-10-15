import { sameInstitution } from './institutionGroups';

/**
 * The requester and the Institution Manager of the request's institution may
 * download proof once the request is APPROVED.
 */
export const canDownloadApprovalProof = (request, user) => {
  if (!request || !user || request.status !== 'APPROVED') return false;
  if (user.role === 'REQUESTER') {
    return String(request.requester?._id || request.requester?.id || request.requester) === String(user.id);
  }
  if (user.role === 'INSTITUTION_MANAGER') {
    return sameInstitution(request.institution, user.institution, user.role);
  }
  return false;
};

/** Approval details for the PDF. */
export const buildApprovalData = (request) => {
  // The per-viewer history hides the Chairman's entry from lower roles, so the
  // backend supplies the final approver separately; an approved request is
  // always shown as approved by the Chairman.
  const chairman = request.approvedBy;

  return {
    approvedAt: chairman?.timestamp || request.updatedAt,
    approvedBy: { name: chairman?.name || '—', role: 'Chairman' },
  };
};

const getNestedValue = (obj, path) =>
  path.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj);

const CURRENCY_HINTS = [
  'cost', 'fee', 'spent', 'provided', 'balance', 'expenditure', 'receipts',
  'amount', 'subsidy', 'price', 'variance',
];

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatMoney = (value) =>
  `Rs. ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Plain-text form of a dynamic form field value, mirroring the details page. */
const formatFieldText = (value, field) => {
  if (value === undefined || value === null || value === '') return '-';
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'date') return formatDate(value);
  if (field.type === 'number' && typeof value === 'number') {
    const name = field.name.toLowerCase();
    return CURRENCY_HINTS.some((hint) => name.includes(hint)) ? formatMoney(value) : value.toLocaleString();
  }
  return String(value);
};

const money = (value) => (value || value === 0 ? formatMoney(value) : '-');

/**
 * Every section of the request page — request, status, management, budget and
 * the type-specific form fields — as PDF sections. Budget allocation figures
 * are left out for the requester and Institution Manager, as on the page.
 */
export const buildApprovalSections = (request, { formFields, categoryLabel, formTitle, user }) => {
  const yesNo = (v) => (v ? 'Yes' : 'No');

  const sections = [
    {
      title: 'Request Information',
      details: [
        { label: 'Request ID', value: request.requestID },
        { label: 'Requester', value: request.requester?.name || 'Unknown' },
        { label: 'Email', value: request.requester?.email || 'N/A' },
        { label: 'Institution', value: request.institution },
        { label: 'Department', value: (request.department || '').replace(/^Department of\s*/i, '') },
        { label: 'Title', value: request.title, full: true },
        { label: 'Description', value: request.description, full: true },
      ],
    },
    {
      title: 'Status Information',
      details: [
        { label: 'Status', value: request.status },
        { label: 'Stage', value: request.stage },
        { label: 'Category', value: categoryLabel },
        { label: 'Created', value: formatDate(request.createdAt) },
      ],
    },
    {
      title: 'Management Information',
      details: [
        { label: 'SOP Available', value: yesNo(request.SOPAvailable) },
        { label: 'SOP Reference', value: request.sopId?.referenceNumber || request.SOP },
        ...(request.sopId?.title ? [{ label: 'Matched SOP', value: request.sopId.title, full: true }] : []),
      ],
    },
  ];

  const budget = [
    { label: 'Cost Estimate', value: money(request.cost) },
    { label: 'Budget Available', value: yesNo(request.budgetAvailable) },
  ];
  if (!['REQUESTER', 'INSTITUTION_MANAGER'].includes(user?.role)) {
    budget.push(
      { label: 'Budget Allocated', value: money(request.budgetAllocated) },
      { label: 'Budget Spent', value: money(request.budgetSpent) },
      { label: 'Budget Remaining', value: money(request.budgetRemaining) }
    );
  }
  sections.push({ title: 'Budget Details', details: budget });

  if (formFields && request.details) {
    sections.push({
      title: `${formTitle} Form Details`,
      details: formFields.map((field) => {
        const value = getNestedValue(request.details, field.name);
        return {
          label: field.label,
          value: formatFieldText(value, field),
          full: field.type === 'textarea',
        };
      }),
    });
  }

  return sections;
};
