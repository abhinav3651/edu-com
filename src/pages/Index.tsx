import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { SemanticAnalyzer, renderSemanticAnalysis } from "@/utils/semanticAnalyzer";
import { IntermediateCodeGenerator, formatTAC } from "@/utils/intermediateCodeGenerator";
import { CodeOptimizer, formatOptimizedCode } from "@/utils/codeOptimizer";
import { CodeGenerator, formatAssembly } from "@/utils/codeGenerator";

// Define token types
const TokenType = {
  PREPROCESSOR: 'PREPROCESSOR',
  KEYWORD: 'KEYWORD',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING_LITERAL: 'STRING_LITERAL',
  OPERATOR: 'OPERATOR',
  SEPARATOR: 'SEPARATOR',
  OPEN_PAREN: 'OPEN_PAREN',
  CLOSE_PAREN: 'CLOSE_PAREN',
  OPEN_BRACE: 'OPEN_BRACE',
  CLOSE_BRACE: 'CLOSE_BRACE',
  COMMENT: 'COMMENT',
  UNDEFINED: 'UNDEFINED'
};

// Token regex patterns
const tokenRegex = {
  [TokenType.PREPROCESSOR]: /^#\s*\w+\s*(<[^>]+>|\"[^\"]+\")/,
  [TokenType.KEYWORD]: /\b(int|char|float|double|if|else|for|while|return|void|include|define)\b/,
  [TokenType.IDENTIFIER]: /\b[a-zA-Z_]\w*\b/,
  [TokenType.NUMBER]: /\b(0x[0-9A-Fa-f]+|\d+(\.\d+)?([eE][-+]?\d+)?)\b/,
  [TokenType.STRING_LITERAL]: /^"([^"\\]|\\.)*"/,
  [TokenType.OPERATOR]: /^(==|!=|<=|>=|\+\+|--|->|&&|\|\||[-+*/%=<>&^|!~])/,
  [TokenType.SEPARATOR]: /^[;,.:]/,
  [TokenType.OPEN_PAREN]: /^[(]/,
  [TokenType.CLOSE_PAREN]: /^[)]/,
  [TokenType.OPEN_BRACE]: /^[{]/,  
  [TokenType.CLOSE_BRACE]: /^[}]/,
  [TokenType.COMMENT]: /^\/\/.*|^\/\*[\s\S]*?\*\//
};

// Token classification function
function classifyLexeme(lexeme: string) {
  for (const [type, regex] of Object.entries(tokenRegex)){
    if (regex.test(lexeme)) return { type, value: lexeme };
  }
  return { type: TokenType.UNDEFINED, value: lexeme };
}

// Tokenizer function
function tokenize(inputCode: string) {
  const tokens: any[] = [];
  inputCode = inputCode.replace(/\/\*[\s\S]*?\*\//g, match => {
    tokens.push({ type: TokenType.COMMENT, value: match });
    return ' '.repeat(match.length);
  });

  const lines = inputCode.split('\n');

  for (let line of lines) {
    let i = 0;
    if (/^\s*#/.test(line)) {
      const match = line.trim();
      tokens.push({ type: TokenType.PREPROCESSOR, value: match });
      continue;
    }

    while (i < line.length) {
      if (/\s/.test(line[i])) {
        i++;
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '/') {
        const comment = line.slice(i);
        tokens.push({ type: TokenType.COMMENT, value: comment });
        break;
      }
      if (line[i] === '"') {
        const match = line.slice(i).match(/^"([^"\\]|\\.)*"/);
        if (match) {
          tokens.push({ type: TokenType.STRING_LITERAL, value: match[0] });
          i += match[0].length;
        } else {
          tokens.push({ type: TokenType.UNDEFINED, value: '"' });
          i++;
        }
        continue;
      }
      const twoChar = line.slice(i, i + 2);
      if (tokenRegex[TokenType.OPERATOR].test(twoChar)) {
        tokens.push({ type: TokenType.OPERATOR, value: twoChar });
        i += 2;
        continue;
      }

      const oneChar = line[i];
      if (tokenRegex[TokenType.OPERATOR].test(oneChar)) {
        tokens.push({ type: TokenType.OPERATOR, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.SEPARATOR].test(oneChar)) {
        tokens.push({ type: TokenType.SEPARATOR, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.OPEN_PAREN].test(oneChar)) {
        tokens.push({ type: TokenType.OPEN_PAREN, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.CLOSE_PAREN].test(oneChar)) {
        tokens.push({ type: TokenType.CLOSE_PAREN, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.OPEN_BRACE].test(oneChar)) {
        tokens.push({ type: TokenType.OPEN_BRACE, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.CLOSE_BRACE].test(oneChar)) {
        tokens.push({ type: TokenType.CLOSE_BRACE, value: oneChar });
        i++;
        continue;
      }
      let lexeme = '';
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
        lexeme += line[i++];
      }

      if (lexeme.length > 0) {
        tokens.push(classifyLexeme(lexeme));
      } else {
        tokens.push({ type: TokenType.UNDEFINED, value: oneChar });
        i++;
      }
    }
  }

  return tokens;
}

// Parser variables and functions
let current = 0;

function isTypeSpecifier(token: any) {
  const types = ['int', 'char', 'float', 'double', 'void'];
  return token.type === 'KEYWORD' && types.includes(token.value);
}

function parse(tokens: any[]) {
  return parseProgram(tokens);
}

function parseProgram(tokens: any[]) {
  let body: any[] = [];
  current = 0;

  while (current < tokens.length) {
    let token = tokens[current];

    if (token.type === 'COMMENT') {
      current++;
      continue;
    }

    if (token.type === 'PREPROCESSOR') {
      body.push({ type: 'PreprocessorDirective', value: token.value.trim() });
      current++;
    } else if (isTypeSpecifier(token)) {
      let funcNode = parseFunctionDefinition(tokens);
      if (funcNode) body.push(funcNode);
    } else {
      current++;
    }
  }
  return { type: 'Program', body };
}

function parseFunctionDefinition(tokens: any[]) {
  let returnType = tokens[current].value;
  current++;
  
  if (current >= tokens.length || tokens[current].type !== 'IDENTIFIER') {
    return { error: "Expected function name" };
  }
  
  let funcName = tokens[current].value;
  current++;

  if (current >= tokens.length || tokens[current].type !== 'OPEN_PAREN') {
    return { error: "Expected '(' after function name" };
  }
  current++; 

  let parameters: any[] = [];
  while (current < tokens.length && tokens[current].value !== ')') {
    if (tokens[current].value === ',') {
      current++;
      continue;
    }
    if (isTypeSpecifier(tokens[current])) {
      let paramType = tokens[current].value;
      current++;
      let paramName = tokens[current] ? tokens[current].value : "<missing id>";
      current++;
      parameters.push({ type: 'Parameter', paramType, paramName });
    } else {
      current++;
    }
  }
  
  if (current >= tokens.length) {
    return { error: "Unexpected end of input while parsing function parameters" };
  }
  
  current++; // Skip over ')'

  if (current >= tokens.length || tokens[current].type !== 'OPEN_BRACE') {
    return { error: "Expected '{' at beginning of function body" };
  }
  let bodyNode = parseCompoundStatement(tokens);
  return {
    type: 'FunctionDeclaration',
    returnType,
    name: funcName,
    parameters,
    body: bodyNode
  };
}

function parseCompoundStatement(tokens: any[]) {
  if (tokens[current].type !== 'OPEN_BRACE') {
    return { error: "Expected '{' at beginning of compound statement" };
  }
  let compound = { type: 'CompoundStatement', body: [] };
  current++;

  while (current < tokens.length && tokens[current].type !== 'CLOSE_BRACE') {
    let stmt = parseStatement(tokens);
    if (stmt) compound.body.push(stmt);
  }
  if (current < tokens.length && tokens[current].type === 'CLOSE_BRACE') {
    current++;
  } else {
    return { error: "Expected '}' at end of compound statement" };
  }
  return compound;
}

function parseStatement(tokens: any[]) {
  if (current >= tokens.length) return null;
  let token = tokens[current];

  if (token.type === 'COMMENT') {
    current++;
    return null;
  }

  if (token.type === 'KEYWORD' && token.value === 'return') {
    return parseReturnStatement(tokens);
  } else if (token.type === 'KEYWORD' && token.value === 'if') {
    return parseIfStatement(tokens);
  } else if (token.type === 'KEYWORD' && token.value === 'for') {
    return parseForStatement(tokens);
  } else if (isTypeSpecifier(token)) {
    return parseDeclaration(tokens, true);
  } else if (token.type === 'OPEN_BRACE') {
    return parseCompoundStatement(tokens);
  } else {
    return parseExpressionStatement(tokens);
  }
}

function parseReturnStatement(tokens: any[]) {
  current++;
  let expr = parseExpression(tokens);
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }
  return { type: 'ReturnStatement', expression: expr };
}

function parseIfStatement(tokens: any[]) {
  current++; 
  if (current >= tokens.length || tokens[current].type !== 'OPEN_PAREN') {
    return { error: "Expected '(' after if" };
  }
  current++;
  let condition = parseExpression(tokens);
  if (current >= tokens.length || tokens[current].type !== 'CLOSE_PAREN') {
    return { error: "Expected ')' after if condition" };
  }
  current++; 
  let thenStmt = parseStatement(tokens);
  let elseStmt = null;
  if (current < tokens.length && tokens[current].type === 'KEYWORD' && tokens[current].value === 'else') {
    current++; 
    elseStmt = parseStatement(tokens);
  }
  return { type: 'IfStatement', condition, then: thenStmt, else: elseStmt };
}

function parseForStatement(tokens: any[]) {
  current++; 
  if (current >= tokens.length || tokens[current].type !== 'OPEN_PAREN') {
    return { error: "Expected '(' after for" };
  }
  current++; 

  let initialization = null;
  if (current < tokens.length && isTypeSpecifier(tokens[current])) {
    initialization = parseDeclaration(tokens, false);
  } else {
    initialization = parseExpression(tokens);
  }
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }

  let condition = parseExpression(tokens);
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }

  let increment = parseExpression(tokens);
  if (current >= tokens.length || tokens[current].type !== 'CLOSE_PAREN') {
    return { error: "Expected ')' after for increment" };
  }
  current++;

  let body = parseStatement(tokens);
  return {
    type: 'ForStatement',
    initialization,
    condition,
    increment,
    body
  };
}

function parseDeclaration(tokens: any[], expectSemicolon: boolean) {
  let varType = tokens[current].value;
  current++;
  const variables: any[] = [];
  while (true) {
    if (current >= tokens.length || tokens[current].type !== 'IDENTIFIER') {
      break;
    }
    let varName = tokens[current].value;
    current++;
    let initializer = null;
    if (current < tokens.length && tokens[current].value === '=') {
      current++;
      initializer = parseExpression(tokens);
    }
    variables.push({ type: "VariableDeclarator", name: varName, initializer });
    if (current >= tokens.length) break;
    if (tokens[current].value === ',') {
      current++;
      continue;
    }
    if (expectSemicolon && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
      current++;
    }
    break;
  }
  return {
    type: 'DeclarationStatement',
    varType,
    variables
  };
}

function parseExpressionStatement(tokens: any[]) {
  let expr = parseExpression(tokens);
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }
  return { type: 'ExpressionStatement', expression: expr };
}

function parseExpression(tokens: any[]) {
  return parseAssignment(tokens);
}

function parseAssignment(tokens: any[]) {
  let left = parseEquality(tokens);
  if (current < tokens.length && tokens[current].value === '=') {
    let op = tokens[current].value;
    current++;
    let right = parseAssignment(tokens);
    return { type: 'AssignmentExpression', operator: op, left, right };
  }
  return left;
}

function parseEquality(tokens: any[]) {
  let left = parseRelational(tokens);
  while (current < tokens.length &&
         (tokens[current].value === '==' || tokens[current].value === '!=')) {
    let op = tokens[current].value;
    current++;
    let right = parseRelational(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseRelational(tokens: any[]) {
  let left = parseAdditive(tokens);
  while (current < tokens.length && ['<', '>', '<=', '>='].includes(tokens[current].value)) {
    let op = tokens[current].value;
    current++;
    let right = parseAdditive(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseAdditive(tokens: any[]) {
  let left = parseMultiplicative(tokens);
  while (current < tokens.length && 
        (tokens[current].value === '+' || tokens[current].value === '-')) {
    let op = tokens[current].value;
    current++;
    let right = parseMultiplicative(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseMultiplicative(tokens: any[]) {
  let left = parseUnary(tokens);
  while (current < tokens.length &&
         (tokens[current].value === '*' || 
          tokens[current].value === '/' || 
          tokens[current].value === '%')) {
    let op = tokens[current].value;
    current++;
    let right = parseUnary(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseUnary(tokens: any[]) {
  if (current < tokens.length &&
      (tokens[current].value === '++' || tokens[current].value === '--')) {
    let op = tokens[current].value;
    current++;
    let argument = parseUnary(tokens);
    return { type: 'PrefixExpression', operator: op, argument };
  }
  return parsePostfix(tokens);
}

function parsePostfix(tokens: any[]) {
  let node = parsePrimary(tokens);
  while (current < tokens.length &&
         (tokens[current].value === '++' || tokens[current].value === '--')) {
    let op = tokens[current].value;
    current++;
    node = { type: 'PostfixExpression', operator: op, argument: node };
  }
  return node;
}

function parsePrimary(tokens: any[]) {
  if (current >= tokens.length) return null;
  let token = tokens[current];

  if ((token.type === 'SEPARATOR' && token.value === ';') || token.type === 'CLOSE_PAREN') {
    return null;
  }

  if (token.type === 'NUMBER' || token.type === 'STRING_LITERAL') {
    current++;
    return { type: 'Literal', value: token.value };
  }

  if (token.type === 'IDENTIFIER' || (token.type === 'KEYWORD' && !isTypeSpecifier(token))) {
    current++;
    let node = { type: 'Identifier', name: token.value };

    if (current < tokens.length && tokens[current].type === 'OPEN_PAREN') {
      current++;
      let args: any[] = [];
      while (current < tokens.length && tokens[current].type !== 'CLOSE_PAREN') {
        let arg = parseExpression(tokens);
        if (arg) args.push(arg);
        if (current < tokens.length && tokens[current].value === ',') {
          current++;
        }
      }
      if (current < tokens.length && tokens[current].type === 'CLOSE_PAREN') {
        current++;
      }
      return { type: 'FunctionCall', name: node.name, arguments: args };
    }
    return node;
  }

  if (token.type === 'OPEN_PAREN') {
    current++; 
    let expr = parseExpression(tokens);
    if (current < tokens.length && tokens[current].type === 'CLOSE_PAREN') {
      current++;
    }
    return expr;
  }

  current++;
  return { type: 'Unknown', value: token.value };
}

// Render AST function
function renderAST(node: any): string {
  if (typeof node !== 'object' || node === null) {
    return `<span class="ast-leaf">${node}</span>`;
  }
  let html = '<ul>';
  if (Array.isArray(node)) {
    node.forEach(child => {
      html += `<li>${renderAST(child)}</li>`;
    });
  } else {
    html += `<li><span class="node-label">${node.type}</span>`;
    for (let key in node) {
      if (key === 'type') continue;
      html += `<ul><li><span class="node-key">${key}:</span> `;
      html += renderAST(node[key]);
      html += `</li></ul>`;
    }
    html += `</li>`;
  }
  html += '</ul>';
  return html;
}

// Index component
const Index = () => {
  const { toast } = useToast();
  const [codeInput, setCodeInput] = useState("");
  const [tokens, setTokens] = useState<any[]>([]);
  const [ast, setAST] = useState<any>(null);
  const [semanticAnalysis, setSemanticAnalysis] = useState<any>(null);
  const [intermediateCode, setIntermediateCode] = useState<string>("");
  const [optimizedCode, setOptimizedCode] = useState<string>("");
  const [assemblyCode, setAssemblyCode] = useState<string>("");
  const [activeTab, setActiveTab] = useState("tokens");

  const handleTokenize = () => {
    try {
      const newTokens = tokenize(codeInput);
      setTokens(newTokens);
      setActiveTab("tokens");
      toast({
        title: "Tokenization Successful",
        description: `Generated ${newTokens.length} tokens`,
      });
    } catch (error) {
      console.error("Tokenization error:", error);
      toast({
        variant: "destructive",
        title: "Tokenization Failed",
        description: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const handleParse = () => {
    try {
      const newTokens = tokenize(codeInput);
      setTokens(newTokens);
      const newAst = parse(newTokens);
      setAST(newAst);
      setActiveTab("ast");
      toast({
        title: "Parsing Successful",
        description: "Abstract Syntax Tree generated",
      });
    } catch (error) {
      console.error("Parsing error:", error);
      toast({
        variant: "destructive",
        title: "Parsing Failed",
        description: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const handleSemanticAnalysis = () => {
    try {
      const newTokens = tokenize(codeInput);
      setTokens(newTokens);
      const newAst = parse(newTokens);
      setAST(newAst);
      
      const semanticAnalyzer = new SemanticAnalyzer();
      const results = semanticAnalyzer.analyze(newAst);
      setSemanticAnalysis(results);
      setActiveTab("semantic");
      
      const errorCount = results.errors.length;
      if (errorCount > 0) {
        toast({
          variant: "destructive",
          title: "Semantic Analysis Completed",
          description: `Found ${errorCount} semantic error${errorCount === 1 ? '' : 's'}`,
        });
      } else {
        toast({
          title: "Semantic Analysis Successful",
          description: "No semantic errors found",
        });
      }
    } catch (error) {
      console.error("Semantic analysis error:", error);
      toast({
        variant: "destructive",
        title: "Semantic Analysis Failed",
        description: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const handleIntermediateCodeGeneration = () => {
    if (!ast) {
      toast({
        title: "Error",
        description: "Please parse the code first",
        variant: "destructive",
      });
      return;
    }

    try {
      const semanticAnalyzer = new SemanticAnalyzer();
      const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
      const functions = intermediateGenerator.generate(ast);
      setIntermediateCode(formatTAC(functions));
      setActiveTab("intermediate");
      toast({
        title: "Success",
        description: "Intermediate code generated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate intermediate code: " + error,
        variant: "destructive",
      });
    }
  };

  const handleCodeOptimization = () => {
    if (!intermediateCode) {
      toast({
        title: "Error",
        description: "Please generate intermediate code first",
        variant: "destructive",
      });
      return;
    }

    try {
      const semanticAnalyzer = new SemanticAnalyzer();
      const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
      const functions = intermediateGenerator.generate(ast);
      const optimizer = new CodeOptimizer(functions);
      const optimizedFunctions = optimizer.optimize();
      setOptimizedCode(formatOptimizedCode(optimizedFunctions));
      setActiveTab("optimized");
      toast({
        title: "Success",
        description: "Code optimized successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to optimize code: " + error,
        variant: "destructive",
      });
    }
  };

  const handleCodeGeneration = () => {
    if (!optimizedCode) {
      toast({
        title: "Error",
        description: "Please optimize the code first",
        variant: "destructive",
      });
      return;
    }

    try {
      const semanticAnalyzer = new SemanticAnalyzer();
      const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
      const functions = intermediateGenerator.generate(ast);
      const optimizer = new CodeOptimizer(functions);
      const optimizedFunctions = optimizer.optimize();
      const generator = new CodeGenerator(optimizedFunctions);
      const assembly = generator.generate();
      setAssemblyCode(formatAssembly(assembly));
      setActiveTab("assembly");
      toast({
        title: "Success",
        description: "Assembly code generated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate assembly code: " + error,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <header className="text-center mb-8 bg-gradient-to-r from-slate-800 to-slate-900 text-white p-8 rounded-lg shadow-xl">
        <h1 className="text-4xl font-bold mb-4">C Compiler Visualizer</h1>
        <p className="text-cyan-400 text-lg">Explore the compilation process step by step</p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* Code Input Section */}
        <Card className="p-6 shadow-lg bg-white dark:bg-slate-800">
          <h2 className="text-2xl font-bold mb-4 text-cyan-600 dark:text-cyan-400">Your C Code</h2>
          <textarea
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            className="w-full h-48 p-4 font-mono text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400"
            spellCheck="false"
            placeholder="Enter your C code here..."
          />
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <Button 
              onClick={handleTokenize} 
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-md transition-colors"
            >
              Tokenize
            </Button>
            <Button 
              onClick={handleParse} 
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-md transition-colors"
            >
              Parse
            </Button>
            <Button 
              onClick={handleSemanticAnalysis} 
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-md transition-colors"
            >
              Analyze Semantics
            </Button>
            <Button 
              onClick={handleIntermediateCodeGeneration} 
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-md transition-colors"
            >
              Generate IR
            </Button>
            <Button 
              onClick={handleCodeOptimization} 
              className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-md transition-colors"
            >
              Optimize
            </Button>
            <Button 
              onClick={handleCodeGeneration} 
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-md transition-colors"
            >
              Generate Assembly
            </Button>
          </div>
        </Card>

        {/* Output Tabs */}
        <Card className="p-6 shadow-lg bg-white dark:bg-slate-800">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-6 gap-2 mb-4">
              <TabsTrigger value="tokens" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white">
                Tokens
              </TabsTrigger>
              <TabsTrigger value="ast" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                AST
              </TabsTrigger>
              <TabsTrigger value="semantic" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                Semantic
              </TabsTrigger>
              <TabsTrigger value="intermediate" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                IR
              </TabsTrigger>
              <TabsTrigger value="optimized" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white">
                Optimized
              </TabsTrigger>
              <TabsTrigger value="assembly" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
                Assembly
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tokens" className="mt-0">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
                <pre className="text-sm font-mono overflow-x-auto">
                  {tokens.map((token, index) => (
                    <div key={index} className="mb-1">
                      <span className="text-blue-600 dark:text-blue-400">{token.type}</span>
                      <span className="mx-2">:</span>
                      <span className="text-green-600 dark:text-green-400">{token.value}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="ast" className="mt-0">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
                <pre className="text-sm font-mono overflow-x-auto">
                  {JSON.stringify(ast, null, 2)}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="semantic" className="mt-0">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
                {semanticAnalysis && (
                  <div className="space-y-4">
                    <div className="semantic-section">
                      <h3 className="text-lg font-bold mb-2 text-purple-600 dark:text-purple-400">Symbol Table</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Type</th>
                              <th>Scope</th>
                              <th>Initialized</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(semanticAnalysis.symbolTable).map(([scope, symbols]: [string, any]) =>
                              symbols.map((symbol: any, index: number) => (
                                <tr key={`${scope}-${index}`}>
                                  <td>{symbol.name}</td>
                                  <td>{symbol.type}</td>
                                  <td>{symbol.scope}</td>
                                  <td>{symbol.isInitialized ? "Yes" : "No"}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="semantic-section">
                      <h3 className="text-lg font-bold mb-2 text-purple-600 dark:text-purple-400">Function Table</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Return Type</th>
                              <th>Parameters</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(semanticAnalysis.functionTable).map(([name, func]: [string, any]) => (
                              <tr key={name}>
                                <td>{func.name}</td>
                                <td>{func.returnType}</td>
                                <td>{func.parameters.map((p: any) => `${p.name}: ${p.type}`).join(", ")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {semanticAnalysis.errors.length > 0 && (
                      <div className="semantic-section">
                        <h3 className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">Errors</h3>
                        <ul className="error-list">
                          {semanticAnalysis.errors.map((error: any, index: number) => (
                            <li key={index} className="error-item">{error.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="intermediate" className="mt-0">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
                <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {intermediateCode || "No intermediate code generated yet"}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="optimized" className="mt-0">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
                <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {optimizedCode || "No optimized code generated yet"}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="assembly" className="mt-0">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md">
                <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {assemblyCode || "No assembly code generated yet"}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <footer className="text-center mt-8 p-4 bg-slate-800 rounded-lg shadow-lg">
        <p className="text-orange-400">By Dhruv Aggarwal, Aarchi Sardana, Vandana Uniyal and Manas Bisht</p>
      </footer>
    </div>
  );
};

export default Index;
