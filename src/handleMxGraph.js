let recast = require('recast')
let fs = require('fs')

let handlePrototype = require('./handlePrototype')
let utils = require('./utils')
let config = require('./config')

let {writeCodeToFile} = utils

function getImportStr(filePath, moduleName, code) {
    return handleModuleDep(code, moduleName).reduce((str, current) => {
        let modulePath = handleModulePath(filePath, current)
        if (modulePath) {
            return str + `import ${current} from '${modulePath}'\n`
        }
        return str
    }, '')
}

function handleModulePath(currentModulePath, depModule) {
    let relativePath = currentModulePath.substring(currentModulePath.indexOf('/js/') + 4)
    let count = relativePath.split('/').length - 1
    let path = ''
    for (let i = 0; i < count; i++) {
        path += '../'
    }
    let depPath = findModule(config.mxGraphRoot, depModule)
    if (!depPath) {
        depPath = utils._findModuleInner(config.mxGraphRoot, depModule)
    }
    if (depPath) {
        let t = depPath.substring(currentModulePath.indexOf('/js/') + 4)
        if (t == 'odel/mxGraphModel') {
            console.log(1);
        }
        t = t.substring(0, t.length - 3)
        path += t
    }
    if (depPath) {
        return path
    }
    return null
}

function findModule(fileDir, moduleName) {
    let list = fs.readdirSync(fileDir)
    for (let fileName of list) {
        let filePath = fileDir + '/' + fileName
        let stat = fs.statSync(filePath)
        if (stat && stat.isDirectory()) {
            // 递归子文件夹
            let path = findModule(filePath, moduleName)
            if (path) {
                return path
            }
        } else {
            if (filePath.endsWith(moduleName + '.js')) {
                return filePath
            }
        }
    }
    return null
}

function handleModuleDep(code, moduleName) {
    let moduleList = []
    let ast = recast.parse(code)
    recast.visit(ast, {
        visitIdentifier(path) {
            let identify = path.value
            let name = identify.name
            if (name.startsWith('mx') && name != 'mxLoadResources' && name != 'mxTransient') {
                if (moduleList.indexOf(name) == -1 && name != moduleName) {
                    moduleList.push(name)
                }
            }
            return false
        },
        visitFunctionDeclaration(path) {
            if (path.value.id.name != moduleName) {
                return false
            } else {
                this.traverse(path)
            }
        }
    })
    return moduleList
}

let handledModuleList = []

function reserveFile(dir) {
    let list = fs.readdirSync(dir)
    list.forEach(function (fileName) {
        let filePath = dir + '/' + fileName
        let stat = fs.statSync(filePath)
        if (stat && stat.isDirectory()) {
            // 递归子文件夹
            reserveFile(filePath)
        } else {
            if (!filePath.endsWith('.js')) {
                return
            }
            let moduleName = fileName.substring(0, fileName.length - 3)
            let code = fs.readFileSync(filePath).toString()
            let resultInfo = handleModule(moduleName, code, filePath)
            handledModuleList.push(filePath)

            if (resultInfo.otherModules.length > 0) {
                resultInfo.otherModules.forEach(moduleName => {
                    let otherModulePath = (dir + '/' + moduleName + '.js')
                    if (handledModuleList.indexOf(otherModulePath) != -1) {
                        console.log(`${moduleName} 重复的模块`)
                    } else {
                        handledModuleList.push(otherModulePath)
                        handleModule(moduleName, code, otherModulePath)
                    }

                })
            }
        }
    })
}

function handleModule(moduleName, code, filePath) {
    let ast = recast.parse(code)

    let resultInfo = handlePrototype(moduleName, ast, {
        findImport: () => getImportStr(filePath, moduleName, code)
    })
    let convertCode = resultInfo.code
    let distPath = filePath.replace('src', 'dist')
    writeCodeToFile(distPath, convertCode)
    return resultInfo
}

reserveFile(config.mxGraphRoot)
