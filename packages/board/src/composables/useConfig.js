/** Board config, fetched once and shared. */

import { reactive, readonly } from 'vue';
import { api } from '../api.js';
import { applyTheme } from '../theme.js';

const state = reactive({
    loaded: false,
    boardTitle: 'Feedback',
    /** @type {Array<{ id: string, slug: string, name: string }>} */
    boards: [],
    /** @type {string[]} */
    statuses: [],
    /** @type {Array<{ id: string, label: string }>} */
    topics: [],
    /** AI interviewer availability (server-gated by ANTHROPIC_API_KEY). */
    assist: { enabled: false }
});

export function useConfig() {
    if (!state.loaded) {
        state.loaded = true;
        api('/api/v1/config')
            .then(config => {
                state.boardTitle = config.boardTitle;
                state.boards = config.boards;
                state.statuses = config.statuses;
                state.topics = config.topics;
                state.assist = config.assist ?? { enabled: false };
                applyTheme(config.theme);
            })
            .catch(() => {
                state.loaded = false;
            });
    }
    return readonly(state);
}
