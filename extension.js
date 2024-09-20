const vscode = require("vscode");
const path = require("path");
const upath = require("upath");
const { TextDecoder, TextEncoder } = require("util");

// TODO: start with files?

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const config = vscode.workspace.getConfiguration("AutoImport");
	const listeners = config.get("useListeners", true);

	if (listeners == true) {
		vscode.workspace.onDidCreateFiles((file) => {
			onFileCreate(file);
		})
		vscode.workspace.onDidRenameFiles((file) => {
			onFileRename(file)
		})
		vscode.workspace.onDidDeleteFiles((file) => {
			onFileDelete(file)
		})
	}

	let disposable = vscode.commands.registerCommand('extension.newPartialFile', function () {

		if (vscode.window.activeTextEditor) {
			const activeEditorUri = vscode.window.activeTextEditor.document.uri;
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditorUri);
			if (!workspaceFolder) {
				vscode.window.showInformationMessage('Not inside a folder');
				return;
			}
			const currentProject = upath.normalize(workspaceFolder.uri.fsPath);

			const config = vscode.workspace.getConfiguration("AutoImport");
			const scssPath = upath.join(currentProject, config.get("defaultImportPath", "src/scss"));
			const importPath = config.get("importPath", "src/scss/main.scss");
			const mainPath = upath.join(currentProject, importPath);

			const input = vscode.window.showInputBox({
				'value': '',
				'placeHolder': 'parse',
				'prompt': 'File Name'
			});
			input.then((value) => {
				if (value != undefined && value != "") {
					onValueSet(value)
				}
			})

			async function onValueSet(value) {
				const extension = getConfigExtension()
				let inputScss;
				if (value.includes("/")) {
					const splitValue = value.split("/");
					const lastValue = splitValue.pop();
					inputScss = `${splitValue.join("/")}/_${lastValue}.${extension}`;
				} else {
					inputScss = `_${value}.${extension}`;
				}
				const newFilePath = upath.join(scssPath, inputScss);
				const { importName } = getRelativeImportPath(newFilePath, importPath,)
				await vscode.workspace.fs.writeFile(vscode.Uri.file(newFilePath), new Uint8Array()).then(() => {
					vscode.workspace.openTextDocument(vscode.Uri.file(newFilePath)).then(doc => {
						vscode.window.showTextDocument(doc)
					})
				})
				const fileContent = await readAndDecode(mainPath);
				const modifiedContent = createImport(fileContent, importName);
				await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
			}

		} else {
			vscode.window.showInformationMessage("Not inside a text editor");
		}
	});

	context.subscriptions.push(disposable);
}

/**
 * Retrieves the file extension configuration.
 * @returns {string} The file extension specified in the configuration, either "scss" or "sass".
 */
function getConfigExtension() {
	const config = vscode.workspace.getConfiguration("AutoImport");
	const extension = config.get("fileExtension", "scss");
	return extension;
}

/**
 * Retrieves the quote style configuration.
 * @returns {string} The quote style configured in the configuration, either "single" or "double".
 */
function getConfigQuotes() {
	const config = vscode.workspace.getConfiguration("AutoImport");
	const quotes = config.get("quotes", "single");
	return quotes;
}

/**
 * Extracts the file name from a given file path.
 * @param {string} input - The full file path.
 * @returns {string} The file name extracted from the path.
 */
function getFileFromPath(input) {
	const result = path.basename(input);
	return result;
}

/**
 * Creates an import statement and appends it to the given file content.
 * @param {string} fileContent - The content of the main file to which the import statement will be added.
 * @param {string} importName - The name of the import to be added.
 * @returns {Uint8Array} The modified file content with the new import statement.
 */
function createImport(fileContent, importName) {
	let lineEnding = '\n';
	if (/\r\n/.test(fileContent)) {
		lineEnding = '\r\n';
	}
	const lines = fileContent.split(lineEnding);
	const extension = getConfigExtension()
	const quotes = getConfigQuotes()
	if (extension == "scss") {
		if (quotes == "single") {
			lines.push(`@import '${importName}';`);
		} else if (quotes == "double") {
			lines.push(`@import "${importName}";`);
		}
	} else if (extension == "sass") {
		lines.push(`@import ${importName}`);
	}
	orderList(lines)
	const modifiedContent = lines.join(lineEnding);
	const encodedContent = new TextEncoder().encode(modifiedContent);
	return encodedContent;
}

/**
 * Checks if the given filePath contains the partialFilePath and if the file is a partial, performs actions if they do.
 * @param {string} filePath - The path of the file to check.
 * @param {string} file - The name of the file to check.
 * @returns {Promise<{mainPath: string, fileContent: string, importName: string} | false>} 
 *          An object containing the main path, file content, and import name if conditions are met, otherwise false.
 */
async function checkAndPerformAction(filePath, file,) {
	const config = vscode.workspace.getConfiguration("AutoImport");
	const newFileDirectory = config.get("partialFilePath", "src/scss");
	const importPath = config.get("importPath", "src/scss/main.scss");
	const extension = getConfigExtension()
	if (filePath.includes(newFileDirectory) && file.endsWith(`.${extension}`) && file.startsWith("_")) {
		const { importName, currentProject } = getRelativeImportPath(filePath, importPath,)
		const mainPath = upath.join(currentProject, importPath);
		const fileContent = await readAndDecode(mainPath);
		return { mainPath, fileContent, importName }
	}
	return false;
}

/**
 * Splits the filePath into a relative importPath and currentProject
 * @param {string} filePath - The path of the file
 * @param {string} importPath - The path of the import file from the configuration
 * @returns {{ importName: string, currentProject: string }} An object containing the relative import name and the current project path.
 */
function getRelativeImportPath(filePath, importPath) {
	const filePathUri = vscode.Uri.file(filePath);
	const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(filePathUri).uri.fsPath;
	const currentProject = upath.normalize(workspaceFolderPath);
	const importPathFull = upath.join(workspaceFolderPath, path.dirname(importPath));
	let importName = upath.normalize(path.relative(importPathFull, filePath));
	console.log(importName + " - inside watch folder");
	// Replace underscore(_) and dot(.) plus 4 characters(scss) with name
	importName = importName.replace(/_(.*?)\.....$/, '$1');
	return { importName, currentProject }
}

/**
 * Reads a file from the given path, decodes its content, and removes empty lines.
 * @param {string} mainPath - The main path for scss/sass imports.
 * @returns {Promise<string>} A promise that resolves to the decoded main file content with empty lines removed.
 */
async function readAndDecode(mainPath) {
	const buffer = await vscode.workspace.fs.readFile(vscode.Uri.file(mainPath));
	let fileContent = new TextDecoder().decode(buffer);
	fileContent = fileContent.replace(/^\s*$/gm, '');
	return fileContent;
}

/**
 * Handles the creation of a new file.
 * @param {Object} file - The file object containing information about the created file.
 * @returns {Promise<void>} A promise that resolves when the file creation process is complete.
 */
async function onFileCreate(file) {
	let filePath = file.files[0].fsPath;
	filePath = upath.normalize(filePath);
	const newFile = getFileFromPath(filePath);
	let result = await checkAndPerformAction(filePath, newFile);
	if (result) {
		const { mainPath, fileContent, importName } = result;
		const modifiedContent = createImport(fileContent, importName);
		await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
	}
}

/**
 * Handles file rename events and triggers appropriate operations based on the file paths and configurations.
 * @param {Object} file - The file object containing information about the renamed file.
 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
 */
async function onFileRename(file) {
	let oldRenamePath = file.files[0].oldUri.fsPath;
	let newRenamePath = file.files[0].newUri.fsPath;
	oldRenamePath = upath.normalize(oldRenamePath)
	newRenamePath = upath.normalize(newRenamePath)
	const oldFile = getFileFromPath(oldRenamePath);
	const newFile = getFileFromPath(newRenamePath);
	const config = vscode.workspace.getConfiguration("AutoImport");
	const newFileDirectory = config.get("partialFilePath", "src/scss");
	const importPath = config.get("importPath", "src/scss/main.scss");
	const extension = getConfigExtension()
	if (newRenamePath.includes(newFileDirectory) || oldRenamePath.includes(newFileDirectory)) {
		if (oldFile == newFile && newFile.startsWith("_") && newFile.endsWith(`.${extension}`)) {
			console.log("moved")
			if (newRenamePath.includes(newFileDirectory) && oldRenamePath.includes(newFileDirectory)) {
				console.log("in - change")
				await triggerOperation(newRenamePath, oldRenamePath, importPath, 'rename');
			} else {
				if (newRenamePath.includes(newFileDirectory)) {
					console.log("in")
					await triggerOperation(newRenamePath, oldRenamePath, importPath, 'create');
				}
				if (oldRenamePath.includes(newFileDirectory)) {
					console.log("out")
					await triggerOperation(newRenamePath, oldRenamePath, importPath, 'delete');
				}
			}
		}
		if (oldFile !== newFile) {
			if (newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)) {
				console.log("Partial renamed")
				await triggerOperation(newRenamePath, oldRenamePath, importPath, 'rename');
			} else if (newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && (!oldFile.startsWith("_") || !oldFile.endsWith(`.${extension}`))) {
				console.log("Partial created")
				await triggerOperation(newRenamePath, oldRenamePath, importPath, 'create');
			} else if ((!newFile.startsWith("_") || !newFile.endsWith(`.${extension}`)) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)) {
				console.log("Partial no more")
				await triggerOperation(newRenamePath, oldRenamePath, importPath, 'delete');
			} else {
				console.log("Normal file renamed")
			}
		}
	}
}

/**
 * Triggers specific operation to rename, create or delete an import statement in the main file. Helper function for onFileRename.
 * @param {string} newRenamePath - The new path for the renamed file.
 * @param {string} oldRenamePath - The old path for the renamed file.
 * @param {string} importPath - The importPath from the configuration.
 * @param {string} operation - The operation to perform ('rename', 'create', 'delete').
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
async function triggerOperation(newRenamePath, oldRenamePath, importPath, operation) {
	const { importName: newImportName, currentProject } = getRelativeImportPath(newRenamePath, importPath);
	const { importName: oldImportName } = getRelativeImportPath(oldRenamePath, importPath);
	const mainPath = upath.join(currentProject, importPath);
	const fileContent = await readAndDecode(mainPath);
	let modifiedContent;
	switch (operation) {
		case 'rename':
			modifiedContent = renameImport(fileContent, oldImportName, newImportName);
			break;
		case 'create':
			modifiedContent = createImport(fileContent, newImportName);
			break;
		case 'delete':
			modifiedContent = deleteImport(fileContent, oldImportName);
			break;
	}
	await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
}

/**
 * Renames an import statement in the given file content.
 * @param {string} fileContent - The content of the main file where the import statement needs to be renamed.
 * @param {string} oldImportName - The old import name that needs to be replaced.
 * @param {string} newImportName - The new import name to replace the old one.
 * @returns {Uint8Array} - The modified file content with the renamed import statement, encoded as a Uint8Array.
 */
function renameImport(fileContent, oldImportName, newImportName) {
	let lineEnding = '\n';
	if (/\r\n/.test(fileContent)) {
		lineEnding = '\r\n';
	}
	const lines = fileContent.split(lineEnding);
	let n = 0
	lines.forEach(function () {
		if (lines[n].replace(/(?:@import) *(?:"|')([^"';\r\n]+).*/gm, "$1") == oldImportName) {
			const importLine = lines[n].replace(/(?:@import) *(?:"|')([^"';\r\n]+).*/gm, "$1");
			const replacedImportLine = importLine.replace(oldImportName, newImportName);
			lines[n] = lines[n].replace(importLine, replacedImportLine);
		}
		n++
	})
	const modifiedContent = lines.join(lineEnding);
	const encodedContent = new TextEncoder().encode(modifiedContent);
	return encodedContent;
}

/**
 * Handles the deletion of files by performing necessary actions on each deleted file.
 * @param {Object} file - The file object containing information about the deleted files.
 * @returns {Promise<void>} A promise that resolves when all actions on deleted files are completed.
 */
async function onFileDelete(file) {
	for (let deletedFile of file.files) {
		let deletedFilePath = deletedFile.fsPath;
		deletedFilePath = upath.normalize(deletedFilePath);
		deletedFile = getFileFromPath(deletedFilePath);
		let result = await checkAndPerformAction(deletedFilePath, deletedFile);
		if (result) {
			const { mainPath, fileContent, importName } = result;
			const modifiedContent = deleteImport(fileContent, importName);
			await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
		}
	}
}

/**
 * Deletes a specific import statement from the given file content.
 * @param {string} fileContent - The content of the main file.
 * @param {string} deletedImportName - The name of the import to be deleted.
 * @returns {Uint8Array} - The modified file content as a Uint8Array.
 */
function deleteImport(fileContent, deletedImportName) {
	let lineEnding = '\n';
	if (/\r\n/.test(fileContent)) {
		lineEnding = '\r\n';
	}
	const lines = fileContent.split(lineEnding);
	const filteredLines = lines.filter(line => line.replace(/(?:@import) *(?:"|')([^"';\r\n]+).*/gm, "$1") !== deletedImportName);
	const modifiedContent = filteredLines.join(lineEnding);
	const encodedContent = new TextEncoder().encode(modifiedContent);
	return encodedContent;
}

/**
 * Orders a list of lines based on a configuration setting.
 * This function reorders the lines array by moving elements that match
 * any of the items specified in the "mainEnd" configuration setting to the end of the array.
 * @param {string[]} lines - The array of lines to be ordered.
 */
function orderList(lines) {
	const config = vscode.workspace.getConfiguration("AutoImport");
	const endString = config.get("mainEnd", "example1, example2");
	const endArray = endString.split(",").map(item => item.trim());
	endArray.forEach(function (endItem) {
		lines.forEach(function (line, index) {
			if (line.replace(/(?:@import) *(?:"|')(?:.*\/)*([^"';\r\n]+).*/gm, "$1") == endItem) {
				lines.push(lines.splice(index, 1)[0]);
			}
		});
	})
}

// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
