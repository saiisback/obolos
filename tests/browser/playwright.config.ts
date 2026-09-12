import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.', testMatch:['workspace-navigation.spec.ts','economy-actions.spec.ts','economy-measurements.spec.ts','agent-economy.spec.ts','resource-marketplace.spec.ts','evidence-resources.spec.ts'], workers:1, timeout:30000, use:{headless:true, viewport:{width:1280,height:900}}, reporter:'list'});
