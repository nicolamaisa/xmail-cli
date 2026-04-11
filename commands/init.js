import chalk from 'chalk';
import {
    bootstrapXmailStack,
    discoverXmailState,
    generateJwtKeys,
    writeXmailEnv
} from '../lib/xmail-control.js';

/**
 * @param {ReturnType<typeof discoverXmailState> extends Promise<infer T> ? T : never} state
 * @returns {string}
 */
function buildDiscoverySummary(state) {
    const containerCount = state.containers.length;
    const missing = state.missingRequiredKeys.length > 0
        ? state.missingRequiredKeys.join(', ')
        : 'none';

    return [
        `Project root: ${state.root}`,
        `Env file: ${state.envExists ? 'present' : 'missing'}`,
        `Compose file: ${state.composeExists ? 'present' : 'missing'}`,
        `Known containers: ${containerCount}`,
        `Missing required env keys: ${missing}`
    ].join('\n');
}

/** @param {AppContext} ctx */
export async function runInit(ctx) {
    const state = await discoverXmailState();
    const current = state.currentValues;

    const modeDecision = state.envExists || state.containers.length > 0
        ? await ctx.prompts.openForm({
            title: 'XMail Bootstrap Discovery',
            mode: 'history',
            entries: [
                {
                    type: 'info',
                    id: 'discovery',
                    title: 'Current project state',
                    content: buildDiscoverySummary(state)
                },
                {
                    type: 'select',
                    id: 'configMode',
                    label: 'How do you want to continue?',
                    options: [
                        { label: 'Resume safely and ask only missing values', value: 'resume' },
                        { label: 'Review and update current values', value: 'review' }
                    ],
                    value: 'resume'
                }
            ]
        })
        : { configMode: 'resume' };

    if (!modeDecision) {
        ctx.log(chalk.yellow('Bootstrap annullato.'));
        return;
    }

    const askAll = modeDecision.configMode === 'review';

    /** @type {PromptEntry[]} */
    const configEntries = [
        {
            type: 'info',
            id: 'bootstrap_intro',
            title: 'Bootstrap flow',
            content: 'This workflow prepares env values, writes .env, starts services, runs migrations and verifies the stack.'
        }
    ];

    if (askAll || !current.PUBLIC_URL) {
        configEntries.push({
            type: 'text',
            id: 'publicUrl',
            label: 'Public base URL',
            placeholder: current.PUBLIC_URL || current.SITE_URL || 'http://localhost:8000',
            value: current.PUBLIC_URL || current.SITE_URL || '',
            required: true
        });
    }

    if (askAll || !current.POSTGRES_PASSWORD) {
        configEntries.push({
            type: 'password',
            id: 'postgresPassword',
            label: 'POSTGRES_PASSWORD',
            placeholder: 'xmail-postgres-password',
            value: current.POSTGRES_PASSWORD || '',
            required: true
        });
    }

    if (askAll || !current.MINIO_ROOT_PASSWORD) {
        configEntries.push({
            type: 'password',
            id: 'minioRootPassword',
            label: 'MINIO_ROOT_PASSWORD',
            placeholder: 'xmail-minio-password',
            value: current.MINIO_ROOT_PASSWORD || '',
            required: true
        });
    }

    if (askAll || !current.RUSTFS_SECRET_KEY) {
        configEntries.push({
            type: 'password',
            id: 'rustfsSecretKey',
            label: 'RUSTFS_SECRET_KEY',
            placeholder: 'xmail-rustfs-secret',
            value: current.RUSTFS_SECRET_KEY || '',
            required: true
        });
    }

    if (askAll || !current.BASIC_PASS) {
        configEntries.push({
            type: 'password',
            id: 'basicPass',
            label: 'BASIC_PASS',
            placeholder: 'admin-password',
            value: current.BASIC_PASS || '',
            required: true
        });
    }

    configEntries.push({
        type: 'multiselect',
        id: 'bootstrapOptions',
        label: 'Bootstrap options',
        options: [
            { label: '1. Run database migrations', value: 'migrations' },
            { label: '2. Enable dev mode rebuild', value: 'dev-mode' },
            { label: '3. Reset DB data before start', value: 'reset-db' }
        ],
        value: [
            ...(state.isConfigured ? [] : ['migrations'])
        ]
    });

    const config = await ctx.prompts.openForm({
        title: 'XMail Initial Configuration',
        mode: 'history',
        entries: configEntries
    });

    if (!config) {
        ctx.log(chalk.yellow('Bootstrap annullato.'));
        return;
    }

    const jwtKeys = (!current.JWT_SECRET || !current.ANON_KEY || !current.SERVICE_ROLE_KEY)
        ? await generateJwtKeys()
        : {
            JWT_SECRET: current.JWT_SECRET,
            ANON_KEY: current.ANON_KEY,
            SERVICE_ROLE_KEY: current.SERVICE_ROLE_KEY
        };

    const publicUrl = String(config.publicUrl || current.PUBLIC_URL || current.SITE_URL || 'http://localhost:8000');
    const bootstrapOptions = Array.isArray(config.bootstrapOptions) ? config.bootstrapOptions : [];

    const nextEnv = {
        ...current,
        PUBLIC_URL: publicUrl,
        SITE_URL: publicUrl,
        API_EXTERNAL_URL: publicUrl,
        PUBLIC_API_BASE_URL: `${publicUrl}/api`,
        PUBLIC_AI_BASE_URL: `${publicUrl}/ai`,
        POSTGRES_PASSWORD: String(config.postgresPassword || current.POSTGRES_PASSWORD || ''),
        MINIO_ROOT_PASSWORD: String(config.minioRootPassword || current.MINIO_ROOT_PASSWORD || ''),
        RUSTFS_SECRET_KEY: String(config.rustfsSecretKey || current.RUSTFS_SECRET_KEY || ''),
        BASIC_PASS: String(config.basicPass || current.BASIC_PASS || ''),
        JWT_SECRET: jwtKeys.JWT_SECRET,
        ANON_KEY: jwtKeys.ANON_KEY,
        SERVICE_ROLE_KEY: jwtKeys.SERVICE_ROLE_KEY
    };

    const review = await ctx.prompts.openForm({
        title: 'Review Bootstrap Changes',
        mode: 'single',
        entries: [
            {
                type: 'info',
                id: 'review_summary',
                title: 'Summary',
                content: [
                    `PUBLIC_URL: ${nextEnv.PUBLIC_URL}`,
                    `POSTGRES_PASSWORD: ${nextEnv.POSTGRES_PASSWORD ? 'set' : 'missing'}`,
                    `MINIO_ROOT_PASSWORD: ${nextEnv.MINIO_ROOT_PASSWORD ? 'set' : 'missing'}`,
                    `RUSTFS_SECRET_KEY: ${nextEnv.RUSTFS_SECRET_KEY ? 'set' : 'missing'}`,
                    `BASIC_PASS: ${nextEnv.BASIC_PASS ? 'set' : 'missing'}`,
                    `JWT keys: ${current.JWT_SECRET && current.ANON_KEY && current.SERVICE_ROLE_KEY ? 'reuse existing' : 'generate new'}`,
                    `Options: ${bootstrapOptions.join(', ') || 'none'}`
                ].join('\n')
            },
            {
                type: 'select',
                id: 'confirm',
                label: 'Write configuration and bootstrap XMail?',
                options: [
                    { label: 'Yes, continue', value: 'yes' },
                    { label: 'No, cancel', value: 'no' }
                ],
                value: 'yes'
            }
        ]
    });

    if (!review || review.confirm !== 'yes') {
        ctx.log(chalk.yellow('Bootstrap annullato prima della scrittura .env.'));
        return;
    }

    await writeXmailEnv(nextEnv);
    ctx.log(chalk.green(`Configuration written to ${state.envFile}`));

    await bootstrapXmailStack(ctx, {
        resetDb: bootstrapOptions.includes('reset-db'),
        runMigrations: bootstrapOptions.includes('migrations'),
        devMode: bootstrapOptions.includes('dev-mode'),
        includeSetupProfile: true,
        showStatusAfter: true
    });

    ctx.log(chalk.green('XMail bootstrap completed.'));
}
