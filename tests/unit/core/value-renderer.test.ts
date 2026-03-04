import type { DebugProtocol } from "@vscode/debugprotocol";
import { describe, expect, it } from "vitest";
import type { ViewportConfig } from "../../../src/core/types.js";
import { convertDAPVariables, isInternalVariable, renderDAPVariable, renderString } from "../../../src/core/value-renderer.js";

const defaultOptions = {
	depth: 0,
	maxDepth: 2,
	stringTruncateLength: 50,
	collectionPreviewItems: 3,
};

const defaultConfig: ViewportConfig = {
	sourceContextLines: 15,
	stackDepth: 5,
	localsMaxDepth: 1,
	localsMaxItems: 20,
	stringTruncateLength: 50,
	collectionPreviewItems: 3,
};

function makeVar(name: string, value: string, type: string, variablesReference = 0): DebugProtocol.Variable {
	return {
		name,
		value,
		type,
		variablesReference,
		evaluateName: name,
		presentationHint: undefined,
		namedVariables: undefined,
		indexedVariables: undefined,
		memoryReference: undefined,
	};
}

describe("renderDAPVariable", () => {
	it("renders int as-is", () => {
		expect(renderDAPVariable(makeVar("x", "42", "int"), defaultOptions)).toBe("42");
	});

	it("renders float as-is", () => {
		expect(renderDAPVariable(makeVar("x", "3.14", "float"), defaultOptions)).toBe("3.14");
	});

	it("renders bool as-is", () => {
		expect(renderDAPVariable(makeVar("x", "True", "bool"), defaultOptions)).toBe("True");
	});

	it("renders NoneType as 'None'", () => {
		expect(renderDAPVariable(makeVar("x", "None", "NoneType"), defaultOptions)).toBe("None");
	});

	it("renders str quoted", () => {
		const result = renderDAPVariable(makeVar("x", "'hello world'", "str"), defaultOptions);
		expect(result).toBe('"hello world"');
	});

	it("renders str truncated at limit with '...'", () => {
		const longStr = "a".repeat(60);
		const result = renderDAPVariable(makeVar("x", `'${longStr}'`, "str"), {
			...defaultOptions,
			stringTruncateLength: 20,
		});
		expect(result).toContain("...");
		expect(result.length).toBeLessThan(30);
	});

	it("renders list with preview items", () => {
		const result = renderDAPVariable(makeVar("x", "[1, 2, 3, 4, 5]", "list"), { ...defaultOptions, collectionPreviewItems: 3 });
		expect(result).toContain("1");
		expect(result).toContain("5 items");
	});

	it("renders empty list correctly", () => {
		const result = renderDAPVariable(makeVar("x", "[]", "list"), defaultOptions);
		expect(result).toContain("0 items");
	});

	it("renders dict with preview", () => {
		const result = renderDAPVariable(makeVar("x", "{'a': 1, 'b': 2}", "dict"), defaultOptions);
		expect(result).toContain("items");
	});

	it("renders object at depth 0 with type info", () => {
		const result = renderDAPVariable(makeVar("user", "<User object at 0x7f1234>", "User", 1), { ...defaultOptions, depth: 0, maxDepth: 2 });
		expect(result).toContain("User");
		expect(result).toContain("<");
	});

	it("renders object at maxDepth as '<TypeName>'", () => {
		const result = renderDAPVariable(makeVar("user", "<User object at 0x7f1234>", "User", 1), { ...defaultOptions, depth: 2, maxDepth: 2 });
		expect(result).toBe("<User>");
	});

	it("handles missing type field gracefully", () => {
		const v = makeVar("x", "42", "");
		v.type = undefined;
		const result = renderDAPVariable(v, defaultOptions);
		expect(result).toBe("42");
	});
});

describe("renderString", () => {
	it("quotes string and returns it", () => {
		expect(renderString("hello", 100)).toBe('"hello"');
	});

	it("truncates long strings", () => {
		const result = renderString("a".repeat(60), 20);
		expect(result).toContain("...");
		expect(result.startsWith('"')).toBe(true);
	});
});

describe("isInternalVariable", () => {
	it("matches __builtins__", () => {
		expect(isInternalVariable("__builtins__")).toBe(true);
	});

	it("matches __doc__", () => {
		expect(isInternalVariable("__doc__")).toBe(true);
	});

	it("matches arbitrary __dunder__ names", () => {
		expect(isInternalVariable("__something__")).toBe(true);
	});

	it("does not match regular names", () => {
		expect(isInternalVariable("x")).toBe(false);
		expect(isInternalVariable("my_var")).toBe(false);
		expect(isInternalVariable("_private")).toBe(false);
	});
});

describe("convertDAPVariables", () => {
	it("filters out __builtins__, __doc__, etc.", () => {
		const vars = [makeVar("x", "1", "int"), makeVar("__builtins__", "{}", "dict"), makeVar("__doc__", "None", "NoneType"), makeVar("__name__", "'__main__'", "str")];
		const result = convertDAPVariables(vars, defaultConfig);
		expect(result.map((v) => v.name)).toEqual(["x"]);
	});

	it("keeps regular variables", () => {
		const vars = [makeVar("x", "42", "int"), makeVar("name", "'Alice'", "str")];
		const result = convertDAPVariables(vars, defaultConfig);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("x");
		expect(result[0].value).toBe("42");
	});

	it("renders values correctly", () => {
		const vars = [makeVar("x", "'hello'", "str")];
		const result = convertDAPVariables(vars, defaultConfig);
		expect(result[0].value).toBe('"hello"');
	});
});
