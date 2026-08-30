/** Human labels for the canonical post statuses. */

const LABELS = {
    open: 'Open',
    under_review: 'Under review',
    planned: 'Planned',
    in_progress: 'In progress',
    complete: 'Complete',
    closed: 'Closed'
};

/** @param {string} status */
export function statusLabel(status) {
    return LABELS[status] ?? status;
}
