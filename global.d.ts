type ColorPalette = {
    logo: string;
    testo: string;
    header: string;
    arancio: string;
    cian: string;
    bordo: string;
    sfondo: string;
};

type AppContext = {
    screen: any;
    logArea: any;
    dashInput: any;
    state: Record<string, unknown>;
    log: (message: string) => void;
    quit: () => void;
};

type CommandHandler = (ctx: AppContext) => void;

type SplashUi = {
    inputSplashBar: any;
    hintText: any;
    inputAccentLine: any;
    splashSuggestions: any;
    screen: any;
};

type DashboardUi = {
    dashInput: any;
    hintDashText: any;
    dashInputAccentLine: any;
    dashSuggestionLines: any[];
    dashSuggestions: any;
    screen: any;
};
