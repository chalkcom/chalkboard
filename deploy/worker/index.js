/**
 * Deployed worker entry point. The worker package is unbuilt ESM, so this
 * imports straight from its source; customise the board here by passing
 * options (theme, topics, boardTitle) to createFeedbackApp.
 */

import { createFeedbackApp } from '@chalkcom/worker/app';

export default createFeedbackApp({});
