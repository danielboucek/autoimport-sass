// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const path = require("path");
const upath = require("upath");

// This method is called when ycur extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */

// TODO: cleanup, support for multiple folder watching?, fix rename and delete of unintended files(folder == file name "sec/sec";), end/start with files:

function activate(context) {
	let config = vscode.workspace.getConfiguration("AutoImport");
	let autoCheck = config.get("useAutoCheck", true);

	function getConfigExtension(){
		let config = vscode.workspace.getConfiguration("AutoImport");
		let extension = config.get("fileExtension", "scss");
		return extension;
	}
	function getNameFromPath(input){
		let result = path.basename(input).slice(1,-5);
		return result;
	}
	function getFileFromPath(input){
		let result = path.basename(input);
		return result;
	}
	function getMainPathFromFilePath(fileNameInput, pathInput){
		let extension = getConfigExtension()
		let config = vscode.workspace.getConfiguration("AutoImport");
		let newFileDirectory = config.get("partialFilePath", "src/scss");
		let halfPath = (`/${newFileDirectory}/_${fileNameInput}.${extension}`);
		let currentProject = pathInput.replace(halfPath, "");
		let mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
		return mainPath;
	}
	function removeCommonParts() {
		let config = vscode.workspace.getConfiguration("AutoImport");
		let folderPath = config.get("partialFilePath", "src/scss");
		let importPath = config.get("importPath", "src/scss/main.scss");
		const parts1 = folderPath.split("/");
		const parts2 = importPath.split("/");
		let i = 0;
		while(parts1[i] === parts2[i]){
			i++;
		}
		let modifiedPath = parts1.slice(i).join("/");
		if(modifiedPath !== ""){
			modifiedPath = modifiedPath + "/";
		}
		if(modifiedPath != ''){
			modifiedPath = upath.normalize(modifiedPath)
		}
		return modifiedPath;
	}
	function createImport(fileContent, newFileName){
		const lines = fileContent.split("\n");
		let modifiedPath = removeCommonParts();
		let extension = getConfigExtension()
		if(extension == "scss"){
			lines.push(`@import "${modifiedPath}${newFileName}";`);
		}else if(extension == "sass"){
			lines.push(`@import ${modifiedPath}${newFileName}`);
		}
		orderList(lines)
		let modifiedContent = lines.join("\n");
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}

	async function readAndDecode(mainPath){
		let buffer = await vscode.workspace.fs.readFile(vscode.Uri.file(mainPath));
		const fileContent = new TextDecoder().decode(buffer);
		return fileContent;
	}
	async function onFileCreate(file){
		console.log("file Created")
		let filePath = file.files[0].fsPath;
		filePath = upath.normalize(filePath)
		let newFile = getFileFromPath(filePath);
		let config = vscode.workspace.getConfiguration("AutoImport");
		let newFileDirectory = config.get("partialFilePath", "src/scss");
		let extension = getConfigExtension()
		if(path.dirname(filePath).endsWith(`${newFileDirectory}`) && newFile.endsWith(`.${extension}`) && newFile.startsWith("_")){
			console.log("- inside watch folder");
			let newFileName = newFile.slice(1,-5);
			let mainPath = getMainPathFromFilePath(newFileName, filePath)
			let fileContent = await readAndDecode(mainPath);
			const modifiedContent = createImport(fileContent, newFileName);
			vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
		}
	}
	
	async function onFileRename(file){
		let oldRenamePath = file.files[0].oldUri.fsPath;
		let newRenamePath = file.files[0].newUri.fsPath;
		oldRenamePath = upath.normalize(oldRenamePath)
		newRenamePath = upath.normalize(newRenamePath)
		let oldFile = getFileFromPath(oldRenamePath);
		let oldFileName = getNameFromPath(oldRenamePath);
		let newFile = getFileFromPath(newRenamePath);
		let newFileName = getNameFromPath(newRenamePath);
		let config = vscode.workspace.getConfiguration("AutoImport");
		let newFileDirectory = config.get("partialFilePath", "src/scss");
		let extension = getConfigExtension()
		if(path.dirname(newRenamePath).endsWith(`${newFileDirectory}`) || path.dirname(oldRenamePath).endsWith(`${newFileDirectory}`)){
			if(oldFile == newFile && newFile.startsWith("_") && newFile.endsWith(`.${extension}`)){
				console.log("moved")
				if(path.dirname(newRenamePath).endsWith(`${newFileDirectory}`)){
					console.log("in")
					let mainPath = getMainPathFromFilePath(newFileName, newRenamePath)
					let fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}
				if(path.dirname(oldRenamePath).endsWith(`${newFileDirectory}`)){
					console.log("out")
					let mainPath = getMainPathFromFilePath(oldFileName, oldRenamePath)
					let fileContent = await readAndDecode(mainPath);
					const modifiedContent = deleteImport(fileContent, oldFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}
			}
			if( oldFile !== newFile){
				let mainPath = getMainPathFromFilePath(newFileName, newRenamePath)
				if(newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)){
					console.log("Partial renamed")
					let fileContent = await readAndDecode(mainPath);
					const modifiedContent = renameImport(fileContent, oldFileName, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}else if(newFile.startsWith("_") && newFile.endsWith(`.${extension}`) && (!oldFile.startsWith("_") || !oldFile.endsWith(`.${extension}`))){
					console.log("Partial created")
					let fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}else if((!newFile.startsWith("_") || !newFile.endsWith(`.${extension}`)) && oldFile.startsWith("_") && oldFile.endsWith(`.${extension}`)){
					console.log("Partial no more")
					let mainPath = getMainPathFromFilePath(oldFileName, oldRenamePath)
					let fileContent = await readAndDecode(mainPath);
					const modifiedContent = deleteImport(fileContent, oldFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}else{
					console.log("Normal file renamed")
				}
			}
		}
	}
	function renameImport(fileContent, oldName, newName) {
		const lines = fileContent.split("\n");
		let n = 0
		lines.forEach(function(){
			if(lines[n].replace(/(@import) (.*\/|"*)([a-z-0-9]+).*/, "$3").search(`${oldName}`, `${newName}`) >= 0){
				lines[n] = lines[n].replace(`${oldName}`, `${newName}`)
			}
			n++
		})
		let modifiedContent = lines.join("\n");
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
	async function onFileDelete(file){
		let deletedFilePath = file.files[0].fsPath;
		deletedFilePath = upath.normalize(deletedFilePath)
		let deletedFile = getFileFromPath(deletedFilePath);
		let deletedFileName = getNameFromPath(deletedFilePath);
		let config = vscode.workspace.getConfiguration("AutoImport");
		let newFileDirectory = config.get("partialFilePath", "src/scss");
		let extension = getConfigExtension();
		if(path.dirname(deletedFilePath).endsWith(`${newFileDirectory}`) && deletedFile.startsWith("_") && deletedFile.endsWith(`.${extension}`)){
			let mainPath = getMainPathFromFilePath(deletedFileName, deletedFilePath)
			let fileContent = await readAndDecode(mainPath);
			const modifiedContent = deleteImport(fileContent, deletedFileName);
			vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
		}
	}
	function deleteImport(fileContent, deletedFileName) {
		const lines = fileContent.split("\n");
		let filteredLines = lines.filter(line => line.replace(/(@import) (.*\/|"*)([a-z-0-9]+).*/, "$3") !== deletedFileName);
		let modifiedContent = filteredLines.join("\n");
		modifiedContent = new TextEncoder().encode(modifiedContent);
		return modifiedContent;
	}
	if(autoCheck == true){
		vscode.workspace.onDidCreateFiles((file)=>{
			onFileCreate(file);
		})
		vscode.workspace.onDidRenameFiles((file)=>{
			onFileRename(file)
		})
		vscode.workspace.onDidDeleteFiles((file)=>{
			onFileDelete(file)
		})
	}

	function orderList(lines){
		let config = vscode.workspace.getConfiguration("AutoImport");
		let endString = config.get("mainEnd", "example1, example2");
		let endArray = endString.split(", ");
		let i = 0
		endArray.forEach(function(){
			let n = 0
			lines.forEach(function(){
				if(lines[n].replace(/(@import) (.*\/|"*)([a-z-0-9]+).*/, "$3").search(endArray[i]) >= 0){
					console.log("found")
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

		if(vscode.window.activeTextEditor){
			let currentlyOpenTabfilePath = vscode.window.activeTextEditor.document.fileName;
			currentlyOpenTabfilePath = upath.normalize(currentlyOpenTabfilePath)

			let folderArray = vscode.workspace.workspaceFolders;
			console.log(folderArray)	

			if(folderArray){
				let n = 0
				let currentProject
				folderArray.forEach(function() {
					let name = folderArray[n].name;
					if(currentlyOpenTabfilePath.includes(name + "\/")){
						currentProject = folderArray[n].uri.fsPath;
						currentProject = upath.normalize(currentProject)
						console.log("include", currentProject)
					}
					n++
				});

				let config = vscode.workspace.getConfiguration("AutoImport");
				let scssPath = upath.join(currentProject, config.get("partialFilePath", "src/scss"));
				let mainPath = upath.join(currentProject, config.get("importPath", "src/scss/main.scss"));
			
				let input = vscode.window.showInputBox({
					'value': '',
					'placeHolder': 'parse',
					'prompt' : 'File Name'
				});
				input.then((value) => {
					if(value != undefined && value != ""){
						onValueSet(value)
					}
				})

				async function onValueSet(value){
					let extension = getConfigExtension()
					let inputScss = `_${value}.${extension}`;
					let newFilePath = upath.join(scssPath, inputScss);
					let newFileName = value;
					vscode.workspace.fs.writeFile(vscode.Uri.file(newFilePath), new Uint8Array()).then(x =>{
						var x = x
						vscode.workspace.openTextDocument(vscode.Uri.file(newFilePath)).then(doc =>{
							vscode.window.showTextDocument(doc)
						})
					})
					let fileContent = await readAndDecode(mainPath);
					const modifiedContent = createImport(fileContent, newFileName);
					vscode.workspace.fs.writeFile(vscode.Uri.file(mainPath), modifiedContent);
				}

			}else{
				vscode.window.showInformationMessage("Not in a folder");
			}
		}else{
			vscode.window.showInformationMessage("Text editor not active");
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
