/** @param {any} ui */
function centerLogoInContainer(ui) {
    const { logoContainer, logo } = ui;
    const logoLineCount = logo.getContent().split('\n').length;
    if (!logoContainer.lpos || !logo.lpos) return;

    const containerWidth = logoContainer.lpos.xl - logoContainer.lpos.xi;
    const containerHeight = logoContainer.lpos.yl - logoContainer.lpos.yi;

    const logoWidth = logo.lpos.xl - logo.lpos.xi;
    const logoHeight = logoLineCount;

    const left = Math.max(0, Math.floor((containerWidth - logoWidth) / 2));
    const top = Math.max(0, Math.floor((containerHeight - logoHeight) / 2));

    logo.left = left;
    logo.top = top;
}

/** @param {any} ui @param {any} screen */
export function layoutDashboard(ui, screen) {
    const { logoContainer, dashSuggestions, header, sideInfo, inputContainer, logArea, bottomInfo } = ui;
    if (!sideInfo.lpos) return;

    logoContainer.left = 0;
    logoContainer.width = 80;
    logoContainer.height = 10;

    screen.render(); // serve per avere lpos aggiornato di logoContainer e logo
    centerLogoInContainer(ui);
    screen.render();

    const leftAreaEnd = sideInfo.lpos.xi - 1;
    const logoEnd = logoContainer.lpos.xl;

    header.left = logoEnd;
    header.width = Math.max(10, leftAreaEnd - logoEnd);

    inputContainer.left = 1;
    inputContainer.width = leftAreaEnd - 1;

    dashSuggestions.left = 2;
    dashSuggestions.width = logoEnd - 2;

    logArea.left = 1;
    logArea.width = leftAreaEnd - 1;

    bottomInfo.left = 1;
    bottomInfo.width = leftAreaEnd - 1;
}
