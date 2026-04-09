
export const COMMANDS = [
    { id: '/init', description: 'Avvia onboarding, setup env e bootstrap di XMail' },
    { id: '/exit', description: 'Esci dall\'applicazione' },
    { id: '/help', description: 'Mostra i comandi disponibili' },
    { id: '/frontend', description: 'Avvia il frontend' },
    { id: '/start', description: 'Avvia la stack XMail' },
    { id: '/stop', description: 'Ferma i container attivi' },
    { id: '/down', description: 'Esegue docker compose down' },
    { id: '/restart', description: 'Riavvia la stack' },
    { id: '/migrate', description: 'Esegue solo le migrazioni del database' },
    { id: '/status', description: 'Mostra lo stato docker compose' },
    { id: '/logs', description: 'Mostra gli ultimi log della stack o di un singolo container' },
    { id: '/reset-db', description: 'Resetta i dati PostgreSQL locali' },
    { id: '/clear', description: 'Pulisci lo schermo' },
    { id: '/test', description: 'Esegui test' },
    { id: '/wizard', description: 'Avvia la procedura guidata di configurazione' },
    { id: '/export-log', description: 'Esporta il log corrente in un file di supporto' }
];
