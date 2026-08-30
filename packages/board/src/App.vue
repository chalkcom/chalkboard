<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { loadUser, session } from './api.js';
import { useConfig } from './composables/useConfig.js';
import { embedState } from './embed/embed.js';

const config = useConfig();
const route = useRoute();

const chromeless = computed(
    () => embedState.active || route.path.startsWith('/embed')
);
const showNav = computed(() => !chromeless.value || !embedState.hideMenu);

onMounted(loadUser);
</script>

<template>
    <div class="min-h-screen">
        <header
            v-if="!chromeless"
            class="border-b border-edge bg-surface-raised"
        >
            <div
                class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3"
            >
                <RouterLink to="/" class="text-lg font-semibold">
                    {{ config.boardTitle }}
                </RouterLink>
                <nav class="flex items-center gap-4 text-sm" aria-label="Main">
                    <RouterLink to="/" class="hover:text-brand"
                        >Board</RouterLink
                    >
                    <RouterLink to="/roadmap" class="hover:text-brand"
                        >Roadmap</RouterLink
                    >
                    <RouterLink
                        v-if="session.user?.isStaff"
                        to="/staff"
                        class="hover:text-brand"
                        >Staff</RouterLink
                    >
                    <span v-if="session.user" class="text-muted">{{
                        session.user.name || session.user.email
                    }}</span>
                </nav>
            </div>
        </header>
        <nav
            v-else-if="showNav"
            class="flex gap-3 px-4 pt-3 text-sm"
            aria-label="Embed"
        >
            <RouterLink to="/embed" class="hover:text-brand">Board</RouterLink>
            <RouterLink to="/embed/roadmap" class="hover:text-brand"
                >Roadmap</RouterLink
            >
        </nav>
        <main class="mx-auto max-w-3xl px-4 py-4">
            <RouterView />
        </main>
    </div>
</template>
