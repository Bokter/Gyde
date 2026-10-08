import * as vscode from 'vscode';

/**
 * Entry point of the extension.
 *
 * TODO(area-2): the command should run the analysis of the open workspace through
 * `@gyde/analysis-engine` (the same engine as the CLI) and show the report in a panel. The API key
 * belongs in `context.secrets`, never in plain settings.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gyde.analyze', async () => {
      await vscode.window.showInformationMessage('Gyde: the analysis is not implemented yet.');
    }),
  );
}

export function deactivate(): void {}
