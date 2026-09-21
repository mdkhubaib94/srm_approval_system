import styles from './ApprovalWorkflow.module.css';

const POLICY_WORKFLOW_STEPS = [
  { id: 'HEAD_OF_INSTITUTION', name: 'Head of Institution' },
  { id: 'CHAIRMAN', name: 'Chairman' },
];

const getStatusDisplayName = (status) => {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getStatusBadgeClass = (stepId, isCurrent, isCompleted) => {
  if (isCompleted) {
    return styles.completedBadge;
  } else if (isCurrent) {
    return styles.currentBadge;
  } else {
    return styles.futureBadge;
  }
};

export default function PolicyWorkflow({ policy }) {
  if (!policy) {
    return null;
  }

  // HEAD_OF_INSTITUTION is always completed (they created it).
  // CHAIRMAN is current while pending, completed once approved/rejected.
  const chairmanCompleted = policy.policyApprovalStatus !== 'PENDING';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Policy Approval Workflow</h3>
          <p className={styles.description}>
            Current status of this policy in the approval process
          </p>
        </div>
      </div>

      <div className={styles.content}>
        {/* Desktop view - horizontal workflow */}
        <div className={styles.desktopView}>
          {/* Workflow steps with progress line */}
          <div className={styles.stepsContainer}>
            {/* Progress line */}
            <div className={styles.progressLineContainer}>
              <div className={styles.progressLineBackground}>
                <div
                  className={styles.progressLineFill}
                  style={{
                    width: chairmanCompleted ? '100%' : '50%',
                  }}
                ></div>
              </div>
            </div>

            {/* Steps */}
            <div className={styles.stepsWrapper}>
            {POLICY_WORKFLOW_STEPS.map((step, index) => {
              const isCompleted = index === 0 || chairmanCompleted;
              const isCurrent = index === 1 && !chairmanCompleted;

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
          {POLICY_WORKFLOW_STEPS.map((step, index) => {
            const isCompleted = index === 0 || chairmanCompleted;
            const isCurrent = index === 1 && !chairmanCompleted;

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
                {index < POLICY_WORKFLOW_STEPS.length - 1 && (
                  <div
                    className={`${styles.mobileConnector} ${
                      chairmanCompleted ? styles.completedConnector : ''
                    }`}
                  ></div>
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
                  {getStatusDisplayName('CHAIRMAN')} stage
                </p>
                <p className={styles.approvalStatus}>
                  Approval Status: <span className={styles.statusValue}>{policy.policyApprovalStatus}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
