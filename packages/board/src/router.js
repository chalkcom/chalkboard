import { createRouter, createWebHistory } from 'vue-router';
import BoardView from './views/BoardView.vue';
import PostView from './views/PostView.vue';
import SubmitView from './views/SubmitView.vue';
import RoadmapView from './views/RoadmapView.vue';
import StaffView from './views/StaffView.vue';

const VIEWS = [
    { path: '', component: BoardView, name: 'board' },
    { path: 'p/:slug', component: PostView, name: 'post' },
    { path: 'submit', component: SubmitView, name: 'submit' },
    { path: 'roadmap', component: RoadmapView, name: 'roadmap' }
];

export function createBoardRouter() {
    return createRouter({
        history: createWebHistory(),
        routes: [
            ...VIEWS.map(view => ({ ...view, path: `/${view.path}` })),
            { path: '/staff', component: StaffView, name: 'staff' },
            // The same views, chrome-less, for the iframe embed.
            ...VIEWS.map(view => ({
                ...view,
                path: `/embed/${view.path}`,
                name: `embed-${view.name}`
            })),
            { path: '/:pathMatch(.*)*', redirect: '/' }
        ]
    });
}
