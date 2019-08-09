let recast = require('recast')

let builders = recast.types.builders
let {identifier, methodDefinition, functionExpression, expressionStatement, callExpression} = builders

let superE = builders.super

function getSuperClass(moduleName, ast) {
    let superClass = null

    recast.visit(ast, {
        visitCallExpression(path) {
            let value = path.value
            let called = value.callee

            if (called.object) {
                if (called.object.name == 'mxUtils' && called.property.name == 'extend') {
                    if (value.arguments[0].name == moduleName) {
                        superClass = identifier(value.arguments[1].name)
                    }
                }
            }
            return false
        },
        visitAssignmentExpression(path) {
            let leftCode = recast.print(path.value.left).code
            let right = path.value.right
            if (leftCode.startsWith(`${moduleName}.`)) {
                let property = leftCode.substring(`${moduleName}`.length + 1)
                if (property === 'prototype') {
                    superClass = right.callee
                }
            }
            return false
        }
    })
    return superClass
}

function getConstructor(moduleName, ast, superClass) {
    let constructor = null
    recast.visit(ast, {
        visitFunctionDeclaration(path) {
            if (path.value.id.name == moduleName) {
                constructor = methodDefinition('constructor', identifier('constructor'), functionExpression(null, path.value.params, path.value.body))
                if (superClass) {
                    let superEs5Call = constructor.value.body.body[0]
                    if (superEs5Call.expression && superEs5Call.expression.type == 'CallExpression') {
                        let callee = superEs5Call.expression.callee
                        if (callee.object.name == superClass.name || callee.property.name == 'call') {
                            constructor.value.body.body[0] = expressionStatement(callExpression(superE(), superEs5Call.expression.arguments.slice(1)))
                        } else {
                            // 默认super()
                            constructor.value.body.body.unshift(expressionStatement(callExpression(superE(), [])))
                        }
                    } else {
                        // 默认super()
                        constructor.value.body.body.unshift(expressionStatement(callExpression(superE(), [])))
                    }
                }
            }
            return false
        },
        visitAssignmentExpression(path) {
            let left = path.value.left
            let right = path.value.right
            if (left.type == 'Identifier' && left.name == moduleName && right.type == 'FunctionExpression') {
                constructor = methodDefinition('constructor', identifier('constructor'), functionExpression(null, right.params, right.body))
            }
            return false
        },
        visitIfStatement(path) {
            return false
        },
        visitObjectExpression(path) {
            return false
        }
    })
    return constructor
}

function getFunction(moduleName, ast) {
    let func = null
    recast.visit(ast, {
        visitFunctionDeclaration(path) {
            if (path.value.id.name == moduleName) {
                func = path.value
            }
            return false
        }
    })
    return func
}

function getOtherModuleList(moduleName, ast) {
    let otherModules = []
    recast.visit(ast, {
        visitFunctionDeclaration(path) {
            if (path.value.id.name == moduleName) {
            } else {
                if (otherModules.indexOf(path.value.id.name) == -1) {
                    otherModules.push(path.value.id.name)
                }
            }
            return false
        },
        visitAssignmentExpression(path) {
            let leftCode = recast.print(path.value.left).code

            if (leftCode.indexOf('.prototype.') != -1) {
                let otherModuleName = leftCode.split('.')[0]
                if (otherModuleName != moduleName && otherModules.indexOf(otherModuleName) == -1) {
                    otherModules.push(otherModuleName)
                }
            }
            return false
        },
        visitObjectExpression() {
            return false
        }
    })
    return otherModules
}

function getCode(expressions) {
    let astResult = recast.parse('')
    if (expressions instanceof Array) {
        expressions.forEach(exp => {
            astResult.program.body.push(exp)
        })
    } else {
        astResult.program.body.push(expressions)
    }
    return recast.print(astResult).code
}

function isInExpression(path, expression) {
    let parentPath = path.parentPath
    while (parentPath) {
        if (parentPath.value.type == expression) {
            return true
        }
        parentPath = parentPath.parentPath
    }
    return false
}

function findParentPath(path, expression) {
    let parentPath = path.parentPath
    while (parentPath) {
        if (parentPath.value.type == expression) {
            return parentPath
        }
        parentPath = parentPath.parentPath
    }
    return null
}

function canUseArrowExpression(context, path) {
    let code = recast.print(path.value).code
    return code.indexOf('arguments') == -1
}

module.exports = {
    getSuperClass,
    getConstructor,
    getOtherModuleList,
    getFunction,
    getCode,
    isInExpression,
    findParentPath,
    canUseArrowExpression
}
