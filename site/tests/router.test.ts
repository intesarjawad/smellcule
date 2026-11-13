import { describe, expect, it } from "vitest";
import { featuresFor, gateRoute, hashParams, parseRoute } from "../src/router";

describe("parseRoute", () => {
  it("treats an empty hash as home", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/")).toEqual({ name: "home" });
  });

  it("reads the fixed views", () => {
    expect(parseRoute("#/browse")).toEqual({ name: "browse" });
    expect(parseRoute("#/decompile")).toEqual({ name: "decompile" });
    expect(parseRoute("#/how")).toEqual({ name: "how" });
  });

  it("reads a molecule id from both link shapes", () => {
    expect(parseRoute("#/m/1066")).toEqual({ name: "card", id: "1066" });
    expect(parseRoute("#/molecule/1066")).toEqual({ name: "card", id: "1066" });
    expect(parseRoute("#/m/rose%20oxide")).toEqual({ name: "card", id: "rose oxide" });
  });

  it("reads the atlas query", () => {
    expect(parseRoute("#/atlas?q=smells%20like%20rain")).toEqual({
      name: "atlas",
      query: "smells like rain",
    });
    expect(parseRoute("#/atlas")).toEqual({ name: "atlas", query: null });
    expect(parseRoute("#/search?q=musk")).toEqual({ name: "atlas", query: "musk" });
  });

  it("reads the daily game and its archive", () => {
    expect(parseRoute("#/smellcule")).toEqual({ name: "smellcule", number: null });
    expect(parseRoute("#/smellcule/12")).toEqual({ name: "smellcule", number: 12 });
    expect(parseRoute("#/smellcule/archive")).toEqual({ name: "smellcule-archive" });
  });

  it("reads the two-molecule and mix sound links", () => {
    expect(parseRoute("#/synesthesia?a=133&b=206")).toEqual({
      name: "synesthesia",
      ids: ["133", "206"],
    });
    expect(parseRoute("#/synesthesia?mix=133,206,1066")).toEqual({
      name: "synesthesia",
      ids: ["133", "206", "1066"],
    });
  });

  it("does not invent a route for an unknown path", () => {
    expect(parseRoute("#/missing/page")).toEqual({ name: "not-found", path: "missing/page" });
  });
});

describe("hashParams", () => {
  it("keeps parameters beside a path", () => {
    expect(hashParams("#/m/1066?phrase=rain").get("phrase")).toBe("rain");
    expect(hashParams("#/browse").get("phrase")).toBeNull();
  });
});

describe("featuresFor", () => {
  it("offers the game and the decompiler for Leffingwell only", () => {
    expect(featuresFor("leffingwell")).toEqual({ game: true, decompiler: true });
    expect(featuresFor("keller")).toEqual({ game: false, decompiler: false });
  });
});

describe("gateRoute", () => {
  it("leaves every Leffingwell route as it was", () => {
    for (const hash of ["#/decompile", "#/smellcule", "#/smellcule/3", "#/smellcule/archive"]) {
      const route = parseRoute(hash);
      expect(gateRoute(route, "leffingwell", 0)).toBe(route);
    }
  });

  it("sends the decompiler to the atlas for Keller", () => {
    expect(gateRoute(parseRoute("#/decompile"), "keller", 19)).toEqual({ redirect: "#/atlas" });
  });

  it("sends every game route to the atlas for Keller when no puzzle was retired", () => {
    for (const hash of ["#/smellcule", "#/smellcule/3", "#/smellcule/archive"]) {
      expect(gateRoute(parseRoute(hash), "keller", 0)).toEqual({ redirect: "#/atlas" });
    }
  });

  it("shows the retired page for Keller when puzzles were retired", () => {
    for (const hash of ["#/smellcule", "#/smellcule/3", "#/smellcule/archive"]) {
      expect(gateRoute(parseRoute(hash), "keller", 19)).toEqual({ name: "smellcule-retired" });
    }
  });

  it("does not touch views both catalogues have", () => {
    for (const hash of ["#/browse", "#/atlas?q=musk", "#/m/1066", "#/how"]) {
      const route = parseRoute(hash);
      expect(gateRoute(route, "keller", 0)).toBe(route);
    }
  });
});
