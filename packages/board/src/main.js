import { createApp } from 'vue';
import App from './App.vue';
import { createBoardRouter } from './router.js';
import { startEmbed } from './embed/embed.js';
import './style.css';

const router = createBoardRouter();

if (window.location.pathname.startsWith('/embed')) {
    startEmbed(router);
}

createApp(App).use(router).mount('#app');
