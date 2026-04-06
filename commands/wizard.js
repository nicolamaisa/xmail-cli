import chalk from 'chalk';

/** @param {AppContext} ctx */
export async function runWizard(ctx) {
    const result = await ctx.prompts.openForm({
        title: 'XMail Initial Configuration',
        mode: 'history',
        entries: [
            {
                type: 'info',
                id: 'intro_provider',
                title: 'Configuration flow',
                content: 'Initial bootstrap for XMail.\nYou will be guided one question at a time.'
            },
            {
                type: 'select',
                id: 'environment',
                label: 'Which environment do you want to configure?',
                options: [
                    { label: 'Development', value: 'development' },
                    { label: 'Production', value: 'production' }
                ],
                value: 'development'
            },
            {
                type: 'text',
                id: 'projectName',
                label: 'Project name',
                placeholder: 'xmail'
            },
            {
                type: 'text',
                id: 'apiUrl',
                label: 'API base URL',
                placeholder: 'http://localhost:3000'
            },
            {
                type: 'password',
                id: 'dbPassword',
                label: 'Database password',
                placeholder: 'postgres-password'
            },
            {
                type: 'password',
                id: 'jwtSecret',
                label: 'JWT secret',
                placeholder: 'super-secret-value'
            },
            {
                type: 'select',
                id: 'provider',
                label: 'Default AI provider',
                options: [
                    { label: 'OpenAI', value: 'openai' },
                    { label: 'Anthropic', value: 'anthropic' },
                    { label: 'Google', value: 'google' },
                    { label: 'OpenRouter', value: 'openrouter' }
                ],
                value: 'openai'
            },
            {
                type: 'multiselect',
                id: 'hooks',
                label: 'Enable optional features?',
                options: [
                    { label: '1. Run DB migrations after start', value: 'migrations' },
                    { label: '2. Tail logs after startup', value: 'logs' },
                    { label: '3. Enable dev mode rebuilds', value: 'dev-mode' }
                ]
            },
            {
                type: 'password',
                id: 'openaiApiKey',
                label: 'OPENAI_API_KEY',
                placeholder: 'sk-...'
            }
        ]
    });

    if (!result) {
        ctx.log(chalk.yellow('Wizard annullato.'));
        return;
    }

    ctx.log(chalk.green('Configurazione iniziale completata.'));
    ctx.log(`Environment: ${chalk.cyan(String(result.environment || ''))}`);
    ctx.log(`Provider: ${chalk.cyan(String(result.provider || ''))}`);
    ctx.log(`Hooks: ${chalk.cyan(Array.isArray(result.hooks) ? result.hooks.join(', ') || 'none' : 'none')}`);
    ctx.log(`Project: ${chalk.cyan(String(result.projectName || ''))}`);
    ctx.log(`API URL: ${chalk.cyan(String(result.apiUrl || ''))}`);
    ctx.log(`DB password: ${result.dbPassword ? chalk.green('set') : chalk.gray('not set')}`);
    ctx.log(`JWT secret: ${result.jwtSecret ? chalk.green('set') : chalk.gray('not set')}`);
    ctx.log(`API key: ${result.openaiApiKey ? chalk.green('set') : chalk.gray('not set')}`);
}
