
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { SemanticAnalyzer, renderSemanticAnalysis } from "@/utils/semanticAnalyzer";

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
  const [codeInput, setCodeInput] = useState(`int main()
{
  int a = 100;
  printf("Hello World: %d\\n", a);
  return 0;
}`);
  const [tokens, setTokens] = useState<any[]>([]);
  const [ast, setAst] = useState<any>(null);
  const [semanticResults, setSemanticResults] = useState<any>(null);
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
      setAst(newAst);
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
      setAst(newAst);
      
      const semanticAnalyzer = new SemanticAnalyzer();
      const results = semanticAnalyzer.analyze(newAst);
      setSemanticResults(results);
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

  return (
    <div className="container mx-auto py-8 px-4">
      <header className="text-center mb-8 bg-slate-800 text-cyan-400 p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold">C Compiler Visualizer</h1>
        <p className="text-orange-400 mt-2">Explore the compilation process step by step</p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* Code Input Section */}
        <Card className="p-6 shadow-lg">
          <h2 className="text-xl font-bold mb-4 text-red-600">Your C Code</h2>
          <textarea
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            className="w-full h-48 p-4 font-mono text-sm bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
            spellCheck="false"
          />
          <div className="flex justify-center gap-4 mt-4">
            <Button onClick={handleTokenize} className="bg-green-500 hover:bg-green-600">
              Tokenize
            </Button>
            <Button onClick={handleParse} className="bg-blue-500 hover:bg-blue-600">
              Parse
            </Button>
            <Button onClick={handleSemanticAnalysis} className="bg-purple-500 hover:bg-purple-600">
              Analyze Semantics
            </Button>
          </div>
        </Card>

        {/* Output Tabs */}
        <Card className="p-6 shadow-lg">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="tokens">Tokens</TabsTrigger>
              <TabsTrigger value="ast">Abstract Syntax Tree</TabsTrigger>
              <TabsTrigger value="semantic">Semantic Analysis</TabsTrigger>
            </TabsList>

            {/* Token Output */}
            <TabsContent value="tokens" className="border rounded-md p-4">
              <h2 className="text-xl font-bold mb-4 text-cyan-600">Lexical Analysis</h2>
              {tokens.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-4 py-2 text-left">Token Type</th>
                        <th className="border px-4 py-2 text-left">Lexeme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((token, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border px-4 py-2 font-mono text-sm">{token.type}</td>
                          <td className="border px-4 py-2 font-mono text-sm">{token.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 italic">Click "Tokenize" to generate tokens</p>
              )}
            </TabsContent>

            {/* AST Output */}
            <TabsContent value="ast" className="border rounded-md p-4">
              <h2 className="text-xl font-bold mb-4 text-cyan-600">Syntax Analysis</h2>
              {ast ? (
                <div 
                  className="bg-white p-4 border rounded-md overflow-auto max-h-[500px]"
                  dangerouslySetInnerHTML={{ __html: renderAST(ast) }}
                />
              ) : (
                <p className="text-gray-500 italic">Click "Parse" to generate the Abstract Syntax Tree</p>
              )}
            </TabsContent>

            {/* Semantic Analysis Output */}
            <TabsContent value="semantic" className="border rounded-md p-4">
              <h2 className="text-xl font-bold mb-4 text-cyan-600">Semantic Analysis</h2>
              {semanticResults ? (
                <div 
                  className="bg-white p-4 border rounded-md overflow-auto max-h-[500px]"
                  dangerouslySetInnerHTML={{ __html: renderSemanticAnalysis(semanticResults) }}
                />
              ) : (
                <p className="text-gray-500 italic">Click "Analyze Semantics" to perform semantic analysis</p>
              )}
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
