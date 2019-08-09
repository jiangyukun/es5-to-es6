let recast = require('recast')
let fs = require('fs')
let path = require('path')
let config = require('../recast/config')

let builders = recast.types.builders

let recastUtil = require('./recastUtil')
let handlePrototype = require('./handlePrototype')
let utils = require('../recast/utils')

let {writeCodeToFile} = utils
let {identifier} = builders

function getImportStr(code, moduleName) {
    let importGraphStr = `import mxGraph4 from 'mxgraph'`
    let moduleStr = handleModuleDep(code, moduleName).reduce((str, current, index) => {
        if (index % 10 == 9) {
            return str + ', ' + current + '\n'
        }
        return str + ', ' + current
    })
    return importGraphStr + '\nlet { ' + moduleStr + ' } = mxGraph4\n'
}

function handleModuleDep(code, moduleName) {
    let moduleList = []
    let ast = recast.parse(code)
    let variableDeclarationList = []
    recast.visit(ast, {
        visitVariableDeclaration(path) {
            let declarations = path.value.declarations
            declarations.forEach(d => {
                if (d.id.name.startsWith('mx')) {
                    if (variableDeclarationList.indexOf(d.id.name) == -1) {
                        variableDeclarationList.push(d.id.name)
                    }
                }
            })
            return false
        },
        visitAssignmentExpression(path) {
            let value = path.value
            if (value.left.type == 'Identifier' && value.left.name.startsWith('mx')) {
                if (variableDeclarationList.indexOf(value.left.name) == -1) {
                    variableDeclarationList.push(value.left.name)
                }
            }
            this.traverse(path)
        }
    })

    recast.visit(ast, {
        visitIdentifier(path) {
            let identify = path.value
            let name = identify.name
            if (name.startsWith('mx') && name != 'mxLoadResources' && name != 'mxTransient') {
                if (variableDeclarationList.indexOf(name) != -1) {
                    return false
                }
                if (moduleList.indexOf(name) == -1) {
                    moduleList.push(name)
                }
            }
            return false
        },

        visitFunctionDeclaration(path) {
            let code = recast.print(path.value).code
            if (path.value.id.name != moduleName) {
                return false
            } else {
                this.traverse(path)
            }
        }
    })
    return moduleList
}

function handleGraph() {
    let filePath = config.graphRoot
    let distPath = path.join(process.cwd(), 'static')
    let moduleName = 'Graph'
    let code = fs.readFileSync(filePath).toString()

    let resultInfo = handleModule(moduleName, code, null, distPath)
    if (resultInfo.otherModules.length > 0) {
        resultInfo.otherModules.forEach((moduleName) => {
            let newModuleName = moduleName
            if (newModuleName.startsWith('mx')) {
                newModuleName = newModuleName.substring(2)
            }
            if (newModuleName == 'Graph') {
                newModuleName = 'Graph1'
            }
            handleModule(moduleName, code, newModuleName, distPath)
        })
    }
}

function handleModule(moduleName, code, newClassName, distPath) {
    let ast = recast.parse(code)

    let resultInfo = handlePrototype(moduleName, ast, {
        findImport: () => getImportStr(code, moduleName),
        newClassName,
        superClass: getSuperClass(moduleName, ast)
    })
    let convertCode = resultInfo.code
    writeCodeToFile(distPath + `/${newClassName || moduleName}.js`, convertCode)
    return resultInfo
}

function getSuperClass(moduleName, ast) {
    let superClass = recastUtil.getSuperClass(moduleName, ast)
    if (!superClass && moduleName.startsWith('mx')) {
        superClass = identifier(moduleName)
    }
    return superClass
}

handleGraph()
