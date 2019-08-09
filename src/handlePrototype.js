let recast = require('recast')
let recastUtil = require('./recastUtil')

let builders = recast.types.builders
let {classDeclaration, classProperty, identifier, classBody, methodDefinition, arrowFunctionExpression, callExpression, memberExpression} = builders
let {spreadElement, arrayExpression} = builders

function handlePrototype(moduleName, ast, options) {
    let bodyAst = []

    let findImport = options.findImport || (() => '')
    let newClassName = options.newClassName || moduleName

    let unHandlePropertyList = []
    let otherModules = recastUtil.getOtherModuleList(moduleName, ast)
    let superClass = options.superClass || recastUtil.getSuperClass(moduleName, ast)
    let constructor = recastUtil.getConstructor(moduleName, ast, superClass)
    let func = recastUtil.getFunction(moduleName, ast)

    recast.visit(ast, {
        // visitIdentifier(path) {
        //     let value = path.value
        //     if (value.name == 'arguments') {
        //         let parentPath = recastUtil.findParentPath(path, 'FunctionExpression')
        //         path.replace(arrayExpression(parentPath.value.params))
        //     }
        //     return false
        // },
        visitObjectExpression() {
            return false
        },
        visitCallExpression(path) {
            let object = path.value.callee.object
            let property = path.value.callee.property
            let argumentList = path.value.arguments
            if (object) {
                if (object.name == 'mxUtils' && property.name == 'bind') {
                    if (argumentList[1].type == 'FunctionExpression' && recastUtil.canUseArrowExpression(this, path)) {
                        path.replace(arrowFunctionExpression(argumentList[1].params, argumentList[1].body, false))
                    }
                }
            }
            if (!superClass) {
                return this.traverse(path)
            }

            if (object && property && property.name == 'apply') {
                if (object.type == 'Identifier') {
                    if (argumentList.length == 2 && argumentList[0].type == 'ThisExpression') {
                        let parentPath = recastUtil.findParentPath(path, 'AssignmentExpression')
                        if (parentPath && parentPath.value.left.property) {
                            let leftCode = recast.print(parentPath.value.left).code
                            let sameFunction = leftCode.toLowerCase().indexOf(object.name.toLowerCase()) != -1
                            if (sameFunction && leftCode.indexOf(`${moduleName}.prototype.`) != -1) {
                                console.log(recast.print(path.value).code)
                                let methodName = parentPath.value.left.property.name
                                if (argumentList[1]) {
                                    path.replace(callExpression(memberExpression(identifier('super'), identifier(methodName)), [spreadElement(argumentList[1])]))
                                } else {
                                    path.replace(callExpression(memberExpression(identifier('super'), identifier(methodName)), []))
                                }
                            }
                        }
                    }
                } else {
                    let leftCode = recast.print(object).code
                    if (leftCode.indexOf(`${superClass.name}.prototype.`) != -1) {
                        console.log(leftCode);
                        let name = leftCode.split('.')[2]
                        if (argumentList[1]) {
                            path.replace(callExpression(memberExpression(identifier('super'), identifier(name)), [spreadElement(identifier('arguments'))]))
                        } else {
                            path.replace(callExpression(memberExpression(identifier('super'), identifier(name)), []))
                        }
                    }
                }
            }
            this.traverse(path)
        },
        visitAssignmentExpression(path) {
            if (recastUtil.isInExpression(path, 'FunctionExpression')) {
                return this.traverse(path)
            }
            let leftCode = recast.print(path.value.left).code
            let right = path.value.right

            if (leftCode.startsWith(`${moduleName}.prototype.`)) {
                let property = leftCode.substring(`${moduleName}.prototype`.length + 1)
                if (!property || property == 'constructor') {
                    return false
                }
                if (right.type == 'FunctionExpression') {
                    bodyAst.push(methodDefinition('method', identifier(property), right))
                } else {
                    bodyAst.push(classProperty(identifier(property), right))
                }
            } else if (leftCode.startsWith(`${moduleName}.`)) {
                let property = leftCode.substring(`${moduleName}`.length + 1)
                if (property === 'prototype') {
                    return false
                }
                if (right.type == 'FunctionExpression') {
                    bodyAst.push(methodDefinition('method', identifier(property), right, true))
                } else {
                    bodyAst.push(classProperty(identifier(property), right, null, true))
                }
            } else if (leftCode.indexOf('.prototype.') != -1) {
                unHandlePropertyList.push(leftCode)
            }
            this.traverse(path)
        }
    })

    if (func && bodyAst.length == 0) {
        // 普通函数
        return {code: findImport() + '\n' + recastUtil.getCode(func), otherModules}
    } else if (bodyAst.length > 0) {
        if (constructor) {
            bodyAst.unshift(constructor)
        }
        if (unHandlePropertyList.length != 0) {
            // console.log(moduleName, unHandlePropertyList)
        }
        let convertCode = recastUtil.getCode(classDeclaration(identifier(newClassName), classBody(bodyAst), superClass)) + `

export default ${newClassName}
`
        return {code: findImport() + '\n' + convertCode, otherModules}
    } else {
        // 常量类
        let returnOldCode = false
        recast.visit(ast, {
            visitVariableDeclaration(path) {
                let value = path.value
                let declaration = value.declarations[0]
                if (declaration.id.name == moduleName) {
                    returnOldCode = true
                }
                return false
            },
            visitFunctionDeclaration() {
                return false
            },
            visitCallExpression() {
                return false
            }
        })
        if (returnOldCode) {
            return {
                code: findImport() + '\n' + recast.print(ast).code + `\n export default ${newClassName}`,
                otherModules
            }
        } else {
            let isRegister = false
            recast.visit(ast, {
                visitFunctionExpression() {
                    return false
                },
                visitFunctionDeclaration() {
                    return false
                },
                visitCallExpression(path) {
                    let value = path.value
                    let callee = value.callee

                    try {
                        if (callee.object.name == 'mxCodecRegistry' && callee.property.name == 'register') {
                            isRegister = true
                        }
                    } catch (e) {
                        console.log(1);
                    }
                    return false
                }
            })
            if (isRegister) {
                return {code: findImport() + '\n' + recast.print(ast).code, otherModules}
            } else {
                console.log(moduleName + '不是一个模块')
                return {otherModules, code: null}
            }

        }
    }
}

module.exports = handlePrototype
