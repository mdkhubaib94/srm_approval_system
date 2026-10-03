import { CATEGORY_STAGE_SEQUENCES } from '../utils/types';
import styles from './ApprovalWorkflow.module.css';

const STAGE_DISPLAY_NAMES = {
  REQUESTER: 'Requester',
  INSTITUTION_MANAGER: 'Institution Manager',
  ACCOUNTANT: 'Accountant',
  HEAD_OF_INSTITUTION: 'Head of Institution',
  CHAIRMAN_OFFICE: 'Chairman Office',
  HR_HEAD: 'HR Head',
  MMA: 'MMA',
  MANAGER_DATA_MANAGEMENT: 'Manager Data Mgmt',
  AUDIT: 'Audit',
  GM_FINANCE: 'GM Finance',
  DIRECTOR_ADMISSIONS: 'Director Admissions',
  DIRECTOR_RESEARCH: 'Director Research',
  DIRECTOR_ADMIN: 'Director Admin',
  CHIEF_DIRECTOR: 'Chief Director',
  CHAIRMAN: 'Chairman',
};

/**
 * Build workflow steps for the given requestCategory.
 * Always starts with REQUESTER, then the category-specific sequence.
 */
const getWorkflowSteps = (requestCategory, isHoiCreated = false, isImCreated = false) => {
  const seq = CATEGORY_STAGE_SEQUENCES[requestCategory] || [];
  return [
    { id: 'REQUESTER', name: STAGE_DISPLAY_NAMES.REQUESTER },
    ...seq
      // HOI-created requests skip the Head of Institution stage (OTHER keeps it: HOI re-routes it).
      .filter((stage) => !(isHoiCreated && requestCategory !== 'OTHER' && stage === 'HEAD_OF_INSTITUTION'))
      // IM-created requests start at the Accountant, so the Institution Manager step never applies.
      .filter((stage) => !(isImCreated && stage === 'INSTITUTION_MANAGER'))
      .map((stage) => ({
      id: stage,
      name: STAGE_DISPLAY_NAMES[stage] || stage,
    })),
  ];
};

const getStatusDisplayName = (status) => {
  if (!status || typeof status !== 'string') return 'Unknown';
  return status
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
    .filter((word) => word.length > 0)
    .join(' ');
};

const getStatusBadgeClass = (stepId, isCurrent, isCompleted) => {
  if (isCompleted) return styles.completedBadge;
  if (isCurrent) return styles.currentBadge;
  return styles.futureBadge;
};

export default function ApprovalWorkflow({ request }) {
  if (!request) return null;

  const workflowSteps = getWorkflowSteps(request.requestCategory, request.isHoiCreated, request.isImCreated);
  const currentStage = request.stage || 'REQUESTER';
  const currentStatusIndex = workflowSteps.findIndex((step) => step.id === currentStage);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Approval Workflow</h3>
          <p className={styles.description}>
            Current status of this request in the approval process
          </p>
        </div>
      </div>

      <div className={styles.content}>
        {/* Desktop view - horizontal workflow */}
        <div className={styles.desktopView}>
          <div className={styles.stepsContainer}>
            {/* Progress line */}
            <div className={styles.progressLineContainer}>
              <div className={styles.progressLineBackground}>
                <div
                  className={styles.progressLineFill}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (currentStatusIndex / (workflowSteps.length - 1)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className={styles.stepsWrapper}>
              {workflowSteps.map((step, index) => {
                const isCompleted = index < currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <div key={step.id} className={styles.stepWrapper}>
                    <div
                      className={`${styles.stepBadge} ${getStatusBadgeClass(
                        step.id,
                        isCurrent,
                        isCompleted
                      )}`}
                    >
                      {isCompleted ? (
                        <svg
                          className={styles.checkIcon}
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        <span className={styles.stepNumber}>{index + 1}</span>
                      )}
                    </div>
                    <div className={styles.stepLabel}>
                      <span
                        className={`${styles.stepName} ${
                          isCurrent
                            ? styles.stepNameCurrent
                            : isCompleted
                            ? styles.stepNameCompleted
                            : styles.stepNameFuture
                        }`}
                      >
                        {step.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile view - vertical workflow */}
        <div className={styles.mobileView}>
          {workflowSteps.map((step, index) => {
            const isCompleted = index < currentStatusIndex;
            const isCurrent = index === currentStatusIndex;

            return (
              <div key={step.id} className={styles.mobileStepContainer}>
                <div className={styles.mobileStepHeader}>
                  <div
                    className={`${styles.stepBadge} ${getStatusBadgeClass(
                      step.id,
                      isCurrent,
                      isCompleted
                    )}`}
                  >
                    {isCompleted ? (
                      <svg
                        className={styles.checkIcon}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <span className={styles.stepNumber}>{index + 1}</span>
                    )}
                  </div>
                  <div className={styles.mobileStepInfo}>
                    <span
                      className={`${styles.stepName} ${
                        isCurrent
                          ? styles.stepNameCurrent
                          : isCompleted
                          ? styles.stepNameCompleted
                          : styles.stepNameFuture
                      }`}
                    >
                      {step.name}
                    </span>
                    {isCurrent && (
                      <span className={styles.currentBadge}>Current</span>
                    )}
                  </div>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div
                    className={`${styles.mobileConnector} ${
                      index < currentStatusIndex ? styles.completedConnector : ''
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Current status information */}
        <div className={styles.statusInfo}>
          <div className={styles.statusInfoContent}>
            <div className={styles.statusInfoIcon}>
              <svg
                className={styles.infoIcon}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className={styles.statusInfoText}>
              <h3 className={styles.statusInfoTitle}>Current Status</h3>
              <div className={styles.statusInfoDetails}>
                <p className={styles.statusInfoValue}>
                  {getStatusDisplayName(currentStage)} stage
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
