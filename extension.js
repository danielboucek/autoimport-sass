// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const path = require("path");
const upath = require("upath");
const { TextDecoder, TextEncoder } = require("util");

// This method is called when ycur extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */

// TODO: cleanup, support for multiple folder watching?, start with files:

function activate(context) {
	const config = vscode.workspace.getConfiguration("AutoImport");
	const listeners = config.get("useListeners", true);

	function getConfigExtension() {
		const config = vscode.workspace.getConfiguration("AutoImport");
		const extension = config.get("fileExtension", "scss");
		return extension;
	}
	function getConfigQuotes() {
		const config = vscode.workspace.getConfiguration("AutoImport");
		const quotes = config.get("quotes", "single");
		return quotes;
	}
	function getFileFromPath(input) {
		const result = path.basename(input);
		return result;
	}
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
		let modifiedContent = lines.join(lineEnding);
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
	// Check if file is inside partialFilePath and is a partial
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
	// Splits the path to a import path and a current project path
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

	async function readAndDecode(mainPath) {
		const buffer = await vscode.workspace.fs.readFile(vscode.Uri.file(mainPath));
		let fileContent = new TextDecoder().decode(buffer);
		fileContent = fileContent.replace(/^\s*$/gm, '');
		return fileContent;
	}
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
					const { importName: newImportName, currentProject } = getRelativeImportPath(newRenamePath, importPath)
					const { importName: oldImportName } = getRelativeImportPath(oldRenamePath, importPath)
					const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = renameImport(fileContent, oldImportName, newImportName);
					await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else {
					if (newRenamePath.includes(newFileDirectory)) {
						console.log("in")
						const { importName: newImportName, currentProject } = getRelativeImportPath(newRenamePath, importPath)
						const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
						const fileContent = await readAndDecode(mainPath);
						const modifiedContent = createImport(fileContent, newImportName);
						await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
					}
					if (oldRenamePath.includes(newFileDirectory)) {
						console.log("out")
						const { importName: oldImportName, currentProject } = getRelativeImportPath(oldRenamePath, importPath)
						const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
						const fileContent = await readAndDecode(mainPath);
						const modifiedContent = deleteImport(fileContent, oldImportName);
						await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
					}
				}
			}
			if (oldFile !== newFile) {
				if (newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)) {
					console.log("Partial renamed")
					const { importName: newImportName, currentProject } = getRelativeImportPath(newRenamePath, importPath)
					const { importName: oldImportName } = getRelativeImportPath(oldRenamePath, importPath)
					const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = renameImport(fileContent, oldImportName, newImportName);
					await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else if (newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && (!oldFile.startsWith("_") || !oldFile.endsWith(`.${extension}`))) {
					console.log("Partial created")
					const { importName: newImportName, currentProject } = getRelativeImportPath(newRenamePath, importPath)
					const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newImportName);
					await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else if ((!newFile.startsWith("_") || !newFile.endsWith(`.${extension}`)) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)) {
					console.log("Partial no more")
					const { importName: oldImportName, currentProject } = getRelativeImportPath(oldRenamePath, importPath)
					const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = deleteImport(fileContent, oldImportName);
					await vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else {
					console.log("Normal file renamed")
				}
			}
		}
	}
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
		let modifiedContent = lines.join(lineEnding);
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
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
	function deleteImport(fileContent, deletedImportName) {
		let lineEnding = '\n';
		if (/\r\n/.test(fileContent)) {
			lineEnding = '\r\n';
		}
		const lines = fileContent.split(lineEnding);
		const filteredLines = lines.filter(line => line.replace(/(?:@import) *(?:"|')([^"';\r\n]+).*/gm, "$1") !== deletedImportName);
		let modifiedContent = filteredLines.join(lineEnding);
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
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

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.newPartialFile', function () {

		if (vscode.window.activeTextEditor) {
			let currentlyOpenTabfilePath = vscode.window.activeTextEditor.document.fileName;
			currentlyOpenTabfilePath = upath.normalize(currentlyOpenTabfilePath)

			let folderArray = vscode.workspace.workspaceFolders;

			if (folderArray) {
				let n = 0
				let currentProject
				folderArray.forEach(function () {
					const name = folderArray[n].name;
					if (currentlyOpenTabfilePath.includes(name + "\/")) {
						currentProject = folderArray[n].uri.fsPath;
						currentProject = upath.normalize(currentProject)
					}
					n++
				});

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
				vscode.window.showInformationMessage("Not inside a folder");
			}
		} else {
			vscode.window.showInformationMessage("Not inside a text editor");
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
