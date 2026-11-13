import { describe, expect, it } from "vitest";
import { parseQuery, searchHref, stripIntent } from "../../src/search/query";

describe("parseQuery", () => {
  it("reads a query from the search string", () => {
    expect(parseQuery("?q=rain")).toBe("rain");
  });

  it("reads the deep-linked query from the hash route", () => {
    expect(parseQuery("#/atlas?q=smells%20like%20rain")).toBe("smells like rain");
  });

  it("prefers a hash query over the search string", () => {
    expect(parseQuery("?q=rain#/atlas?q=smoke")).toBe("smoke");
  });

  it("decodes plus signs and trims the value", () => {
    expect(parseQuery("?q=+smells+like+rain+")).toBe("smells like rain");
  });

  it("returns null when q is absent or blank", () => {
    expect(parseQuery("#/atlas")).toBeNull();
    expect(parseQuery("?x=1")).toBeNull();
    expect(parseQuery("?q=")).toBeNull();
    expect(parseQuery("?q=%20%20")).toBeNull();
  });

  it("keeps a query before a trailing fragment", () => {
    expect(parseQuery("https://example.com/atlas?q=rain#card")).toBe("rain");
  });
});

describe("stripIntent", () => {
  it("reduces a sentence to the smell it names", () => {
    expect(stripIntent("smells like rain")).toBe("rain");
    expect(stripIntent("smell of smoke")).toBe("smoke");
  });

  it("leaves an ordinary query alone", () => {
    expect(stripIntent("rain")).toBe("rain");
  });
});

describe("searchHref", () => {
  it("builds the deep link used by suggestions", () => {
    expect(searchHref("smells like rain")).toBe("#/atlas?q=smells%20like%20rain");
  });
});
