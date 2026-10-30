const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let currentPanel = undefined;

  let disposable = vscode.commands.registerCommand('daily-gk.open', function () {
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (currentPanel) {
      currentPanel.reveal(columnToShowIn);
      return;
    }

    currentPanel = vscode.window.createWebviewPanel(
      'dailyGk',
      'Daily GK',
      columnToShowIn || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
      }
    );

    currentPanel.webview.html = getWebviewContent(context, currentPanel.webview);

    currentPanel.webview.onDidReceiveMessage(
      async (message) => {
        if (!message) return;
        switch (message.command) {
          case 'selectPakFile': {
            const fileUris = await vscode.window.showOpenDialog({
              canSelectMany: false,
              openLabel: 'Load PAK File',
              filters: {
                'PAK Archives': ['pak']
              }
            });

            if (fileUris && fileUris.length > 0) {
              const uri = fileUris[0];
              const fileData = await vscode.workspace.fs.readFile(uri);
              const fileName = path.basename(uri.fsPath);
              currentPanel.webview.postMessage({
                command: 'loadPakBuffer',
                filename: fileName,
                buffer: Array.from(fileData)
              });
            }
            break;
          }
          case 'openExternal': {
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
          }
          case 'closePanel': {
            currentPanel.dispose();
            break;
          }
        }
      },
      undefined,
      context.subscriptions
    );

    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
      },
      null,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(context, webview) {
  const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Convert local media path to a secure webview URI
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'media', 'main.js'))
  );

  html = html.replace('{{scriptUri}}', scriptUri.toString());
  return html;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};