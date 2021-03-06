/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor, EditorContextKeys } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { ISnippetsRegistry, Extensions, ISnippet } from 'vs/editor/common/modes/snippetsRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import { LanguageId } from 'vs/editor/common/modes';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';

interface ISnippetPick extends IPickOpenEntry {
	snippet: ISnippet;
}

class Args {

	static fromUser(arg: any): Args {
		if (!arg || typeof arg !== 'object') {
			return Args._empty;
		}
		let {snippet, name, langId} = arg;
		if (typeof snippet !== 'string') {
			snippet = undefined;
		}
		if (typeof name !== 'string') {
			name = undefined;
		}
		if (typeof langId !== 'string') {
			langId = undefined;
		}
		return new Args(snippet, name, langId);
	}

	private static _empty = new Args(undefined, undefined, undefined);

	private constructor(
		public readonly snippet: string,
		public readonly name: string,
		public readonly langId: string
	) {

	}

}

@editorAction
class InsertSnippetAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertSnippet',
			label: nls.localize('snippet.suggestions.label', "Insert Snippet"),
			alias: 'Insert Snippet',
			precondition: EditorContextKeys.Writable
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor, arg: any): TPromise<void> {
		const modeService = accessor.get(IModeService);

		if (!editor.getModel()) {
			return;
		}

		const quickOpenService = accessor.get(IQuickOpenService);
		const {lineNumber, column} = editor.getPosition();
		let {snippet, name, langId} = Args.fromUser(arg);


		return new TPromise<ISnippet>((resolve, reject) => {

			if (snippet) {
				return resolve({
					codeSnippet: snippet,
					description: undefined,
					name: undefined,
					owner: undefined,
					prefix: undefined
				});
			}

			let languageId: LanguageId;
			if (langId) {
				languageId = modeService.getLanguageIdentifier(langId).id;
			} else {
				languageId = editor.getModel().getLanguageIdAtPosition(lineNumber, column);

				// validate the `languageId` to ensure this is a user
				// facing language with a name and the chance to have
				// snippets, else fall back to the outer language
				const {language} = modeService.getLanguageIdentifier(languageId);
				if (!modeService.getLanguageName(language)) {
					languageId = editor.getModel().getLanguageIdentifier().id;
				}
			}

			if (name) {
				// take selected snippet
				Registry.as<ISnippetsRegistry>(Extensions.Snippets).visitSnippets(languageId, snippet => {
					if (snippet.name !== name) {
						return true;
					}
					resolve(snippet);
				});
			} else {
				// let user pick a snippet
				const picks: ISnippetPick[] = [];
				Registry.as<ISnippetsRegistry>(Extensions.Snippets).visitSnippets(languageId, snippet => {
					picks.push({
						label: snippet.prefix,
						detail: snippet.description,
						snippet
					});
					return true;
				});
				return quickOpenService.pick(picks).then(pick => resolve(pick && pick.snippet), reject);
			}
		}).then(snippet => {
			if (snippet) {
				SnippetController.get(editor).insertSnippet(snippet.codeSnippet, 0, 0);
			}
		});
	}
}

// compatibility command to make sure old keybinding are still working
CommandsRegistry.registerCommand('editor.action.showSnippets', accessor => {
	return accessor.get(ICommandService).executeCommand('editor.action.insertSnippet');
});
