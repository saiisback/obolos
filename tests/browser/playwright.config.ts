import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.', testMatch:'workspace-navigation.spec.ts', workers:1, timeout:30000, use:{headless:true, viewport:{width:1280,height:900}}, reporter:'list'});
