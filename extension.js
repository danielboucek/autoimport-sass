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
	const autoCheck = config.get("useAutoCheck", true);

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
	function getNameFromPath(input) {
		const result = path.basename(input).slice(1, -5);
		return result;
	}
	function getFileFromPath(input) {
		const result = path.basename(input);
		return result;
	}
	function getMainPathFromFilePath(fileNameInput, pathInput) {
		const extension = getConfigExtension()
		const config = vscode.workspace.getConfiguration("AutoImport");
		const newFileDirectory = config.get("partialFilePath", "src/scss");
		const halfPath = (`/${newFileDirectory}/_${fileNameInput}.${extension}`);
		const currentProject = pathInput.replace(halfPath, "");
		const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
		return mainPath;
	}
	function removeCommonParts() {
		const config = vscode.workspace.getConfiguration("AutoImport");
		const folderPath = config.get("partialFilePath", "src/scss");
		const importPath = config.get("importPath", "src/scss/main.scss");
		const parts1 = folderPath.split("/");
		const parts2 = importPath.split("/");
		let i = 0;
		while (parts1[i] === parts2[i]) {
			i++;
		}
		let modifiedPath = parts1.slice(i).join("/");
		if (modifiedPath !== "") {
			modifiedPath = modifiedPath + "/";
		}
		if (modifiedPath != '') {
			modifiedPath = upath.normalize(modifiedPath)
		}
		return modifiedPath;
	}
	function createImport(fileContent, importName) {
		const lines = fileContent.split("\n");
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
		let modifiedContent = lines.join("\n");
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
	// Check if file is inside partialFilePath and is a partial
	async function checkAndPerformAction(filePath, file,) {
		const config = vscode.workspace.getConfiguration("AutoImport");
		const newFileDirectory = config.get("partialFilePath", "src/scss");
		const extension = getConfigExtension()
		if (filePath.includes(newFileDirectory) && file.endsWith(`.${extension}`) && file.startsWith("_")) {
			let splitPath = filePath.split(newFileDirectory)[1];
			const currentProject = filePath.split(newFileDirectory)[0];
			console.log(currentProject)
			if (splitPath.startsWith("/")) {
				splitPath = splitPath.substring(1)
			}
			console.log(splitPath + " - inside watch folder");
			// Replace underscore(_) and dot(.) plus 4 characters(scss) with name
			splitPath = splitPath.replace(/_(.*?)\.....$/, '$1');
			console.log(splitPath)
			const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
			const fileContent = await readAndDecode(mainPath);
			return { mainPath, fileContent, splitPath }
		}
		return false;
	}

	async function readAndDecode(mainPath) {
		const buffer = await vscode.workspace.fs.readFile(vscode.Uri.file(mainPath));
		let fileContent = new TextDecoder().decode(buffer);
		fileContent = fileContent.replace(/^\s*[\r\n]/gm, '');
		return fileContent;
	}
	async function onFileCreate(file) {
		console.log("file Created")
		let filePath = file.files[0].fsPath;
		filePath = upath.normalize(filePath);
		console.log(filePath);
		const newFile = getFileFromPath(filePath);
		let result = await checkAndPerformAction(filePath, newFile);
		if (result) {
			const { mainPath, fileContent, splitPath } = result;
			const modifiedContent = createImport(fileContent, splitPath);
			vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
		}
	}

	async function onFileRename(file) {
		let oldRenamePath = file.files[0].oldUri.fsPath;
		let newRenamePath = file.files[0].newUri.fsPath;
		oldRenamePath = upath.normalize(oldRenamePath)
		newRenamePath = upath.normalize(newRenamePath)
		const oldFile = getFileFromPath(oldRenamePath);
		const oldFileName = getNameFromPath(oldRenamePath);
		const newFile = getFileFromPath(newRenamePath);
		const newFileName = getNameFromPath(newRenamePath);
		const config = vscode.workspace.getConfiguration("AutoImport");
		const newFileDirectory = config.get("partialFilePath", "src/scss");
		const extension = getConfigExtension()
		if (path.dirname(newRenamePath).endsWith(`${newFileDirectory}`) || path.dirname(oldRenamePath).endsWith(`${newFileDirectory}`)) {
			if (oldFile == newFile && newFile.startsWith("_") && newFile.endsWith(`.${extension}`)) {
				console.log("moved")
				if (path.dirname(newRenamePath).endsWith(`${newFileDirectory}`)) {
					console.log("in")
					const mainPath = getMainPathFromFilePath(newFileName, newRenamePath)
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}
				if (path.dirname(oldRenamePath).endsWith(`${newFileDirectory}`)) {
					console.log("out")
					const mainPath = getMainPathFromFilePath(oldFileName, oldRenamePath)
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = deleteImport(fileContent, oldFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}
			}
			if (oldFile !== newFile) {
				const mainPath = getMainPathFromFilePath(newFileName, newRenamePath)
				if (newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)) {
					console.log("Partial renamed")
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = renameImport(fileContent, oldFileName, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else if (newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && (!oldFile.startsWith("_") || !oldFile.endsWith(`.${extension}`))) {
					console.log("Partial created")
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else if ((!newFile.startsWith("_") || !newFile.endsWith(`.${extension}`)) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)) {
					console.log("Partial no more")
					const mainPath = getMainPathFromFilePath(oldFileName, oldRenamePath)
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = deleteImport(fileContent, oldFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				} else {
					console.log("Normal file renamed")
				}
			}
		}
	}
	function renameImport(fileContent, oldName, newName) {
		const lines = fileContent.split("\n");
		let n = 0
		const modifiedPath = removeCommonParts()
		lines.forEach(function () {
			if (lines[n].replace(/(?:@import) *(?:"|')([^"';\n]+).*/gm, "$1") == modifiedPath + oldName) {
				const importLine = lines[n].replace(/(?:@import) *(?:"|')([^"';\n]+).*/gm, "$1");
				const replacedImportLine = importLine.replace(oldName, newName);
				lines[n] = lines[n].replace(importLine, replacedImportLine);
			}
			n++
		})
		let modifiedContent = lines.join("\n");
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
	async function onFileDelete(file) {
		for (let deletedFile of file.files) {
			let deletedFilePath = deletedFile.fsPath;
			deletedFilePath = upath.normalize(deletedFilePath);
			console.log(deletedFilePath)
			deletedFile = getFileFromPath(deletedFilePath);
			let result = await checkAndPerformAction(deletedFilePath, deletedFile);
			if (result) {
				const { mainPath, fileContent, splitPath } = result;
				const modifiedContent = deleteImport(fileContent, splitPath);
				vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
			}
		}
	}
	function deleteImport(fileContent, deletedImportName) {
		const lines = fileContent.split("\n");
		const filteredLines = lines.filter(line => line.replace(/(?:@import) *(?:"|')([^"';\n]+).*/gm, "$1") !== deletedImportName);
		let modifiedContent = filteredLines.join("\n");
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
	if (autoCheck == true) {
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
		console.log("orderList")
		const config = vscode.workspace.getConfiguration("AutoImport");
		const endString = config.get("mainEnd", "example1, example2");
		const endArray = endString.split(", ");
		let i = 0
		endArray.forEach(function () {
			let n = 0
			lines.forEach(function () {
				if (lines[n].replace(/(?:@import) *(?:"|')(?:.*\/)*([^"';\n]+).*/gm, "$1") == endArray[i]) {
					console.log("sorting")
					lines.push(lines.splice(n, 1)[0]);
				}
				n++
			});
			i++
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
			console.log(folderArray)

			if (folderArray) {
				let n = 0
				let currentProject
				folderArray.forEach(function () {
					const name = folderArray[n].name;
					if (currentlyOpenTabfilePath.includes(name + "\/")) {
						currentProject = folderArray[n].uri.fsPath;
						currentProject = upath.normalize(currentProject)
						console.log("include", currentProject)
					}
					n++
				});

				const config = vscode.workspace.getConfiguration("AutoImport");
				const scssPath = upath.join(currentProject, config.get("partialFilePath", "src/scss"));
				const mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));

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
					const inputScss = `_${value}.${extension}`;
					const newFilePath = upath.join(scssPath, inputScss);
					const newFileName = value;
					vscode.workspace.fs.writeFile(vscode.Uri.file(newFilePath), new Uint8Array()).then(x => {
						var x = x
						vscode.workspace.openTextDocument(vscode.Uri.file(newFilePath)).then(doc => {
							vscode.window.showTextDocument(doc)
						})
					})
					const fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
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
