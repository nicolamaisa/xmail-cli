import { getCommandSplashSuggestions, getCommandSuggestions } from './suggestions.js';

/** @param {SplashUi} ui @param {ColorPalette} colors */
export function refreshSplashInputUI(ui, colors) {
    const { inputSplashBar, hintText, inputAccentLine, splashSuggestions, screen } = ui;
    const value = inputSplashBar.getValue() || '';
    const isEmpty = value.length === 0;
    const isCommandMode = value.startsWith('/');

    if (isEmpty) {
        hintText.show();
        inputAccentLine.style.bg = colors.cian;
    } else {
        hintText.hide();
        inputAccentLine.style.bg = colors.arancio;
    }

    const suggestions = getCommandSplashSuggestions(value);

    if (!isEmpty && isCommandMode && suggestions.length > 0) {
        splashSuggestions.setContent(
            suggestions.map((cmd, i) =>
                i === 0
                    ? `{bold}{white-fg}${cmd.id} - ${cmd.description}{/white-fg}{/bold}`
                    : `{gray-fg}${cmd.id} - ${cmd.description}{/gray-fg}`
            ).join('\n')
        );
        splashSuggestions.show();
    } else {
        splashSuggestions.hide();
    }

    screen.render();
}

/** @param {DashboardUi} ui @param {ColorPalette} colors */
export function refreshDashInputUI(ui, colors) {
    const { dashInput, hintDashText, dashInputAccentLine, dashSuggestionLines, dashSuggestions, screen } = ui;
    const value = dashInput.getValue() || '';
    const isEmpty = value.length === 0;
    const isCommandMode = value.startsWith('/');

    if (isEmpty) {
        hintDashText.show();
        dashInputAccentLine.style.bg = colors.cian;
    } else {
        hintDashText.hide();
        dashInputAccentLine.style.bg = colors.arancio;
    }

    for (const line of dashSuggestionLines) {
        line.hide();
        line.setContent('');
    }

    const suggestions = getCommandSuggestions(value).slice(0, 3);

    if (!isEmpty && isCommandMode && suggestions.length > 0) {
        suggestions.forEach((cmd, i) => {
            const text =
                i === 0
                    ? `{bold}{white-fg}${cmd.id} - ${cmd.description}{/white-fg}{/bold}`
                    : `{gray-fg}${cmd.id} - ${cmd.description}{/gray-fg}`;

            dashSuggestionLines[i].setContent(text);
            dashSuggestionLines[i].show();
        });

        dashSuggestions.show();
    } else {
        dashSuggestions.hide();
    }

    screen.render();
}
