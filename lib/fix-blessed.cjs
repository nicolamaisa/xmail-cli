// fix-blessed.cjs
// We explicitly require these so esbuild can find and bundle them.
try {
    require('neo-blessed/lib/widgets/node');
    require('neo-blessed/lib/widgets/screen');
    require('neo-blessed/lib/widgets/element');
    require('neo-blessed/lib/widgets/box');
    require('neo-blessed/lib/widgets/text');
    require('neo-blessed/lib/widgets/line');
    require('neo-blessed/lib/widgets/scrollablebox');
    require('neo-blessed/lib/widgets/scrollabletext');
    require('neo-blessed/lib/widgets/bigtext');
    require('neo-blessed/lib/widgets/list');
    require('neo-blessed/lib/widgets/form');
    require('neo-blessed/lib/widgets/input');
    require('neo-blessed/lib/widgets/textarea');
    require('neo-blessed/lib/widgets/textbox');
    require('neo-blessed/lib/widgets/button');
    require('neo-blessed/lib/widgets/checkbox');
    require('neo-blessed/lib/widgets/radiobutton');
    require('neo-blessed/lib/widgets/radioset');
    require('neo-blessed/lib/widgets/listbar');
    require('neo-blessed/lib/widgets/prompt');
    require('neo-blessed/lib/widgets/question');
    require('neo-blessed/lib/widgets/message');
    require('neo-blessed/lib/widgets/loading');
    require('neo-blessed/lib/widgets/listtable');
    require('neo-blessed/lib/widgets/progressbar');
    require('neo-blessed/lib/widgets/log');
    require('neo-blessed/lib/widgets/table');
    require('neo-blessed/lib/widgets/terminal');
    require('neo-blessed/lib/widgets/image');
} catch (e) {
    // Ignore errors; some might not exist in your specific version
}