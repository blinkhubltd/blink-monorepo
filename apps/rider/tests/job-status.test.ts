import { describe, expect, it } from "vitest";

import {
  canStartRide,
  isOnTheWay,
  jobStatus,
  jobSteps,
  JOB_STEPS,
} from "../lib/job-status";

describe("jobStatus", () => {
  it("speaks the rider's language, not the system's", () => {
    expect(jobStatus("Awaiting Pickup")).toEqual({
      label: "Awaiting pickup",
      tone: "ink",
    });
    expect(jobStatus("Out for Delivery").label).toBe("On the way");
    expect(jobStatus("Delivered").tone).toBe("success");
  });

  it("shows an unknown status as-is, neutrally, rather than blank", () => {
    expect(jobStatus("Rerouted")).toEqual({ label: "Rerouted", tone: "neutral" });
  });
});

describe("jobSteps", () => {
  it("always has four steps, matching the labels", () => {
    for (const s of ["Awaiting Pickup", "Picked Up", "Out for Delivery", "Delivered", "Failed Delivery", "?"]) {
      expect(jobSteps(s)).toHaveLength(JOB_STEPS.length);
    }
  });

  it("marks the hub as the current step until the rider sets off", () => {
    expect(jobSteps("Awaiting Pickup")).toEqual(["done", "now", "todo", "todo"]);
  });

  it("is complete only when delivered", () => {
    expect(jobSteps("Delivered").every((s) => s === "done")).toBe(true);
    expect(jobSteps("Failed Delivery")[3]).toBe("todo");
  });
});

describe("ride gating", () => {
  it("lets a ride start from the hub, and only from there", () => {
    expect(canStartRide("Awaiting Pickup")).toBe(true);
    expect(canStartRide("Picked Up")).toBe(true);
    expect(canStartRide("Out for Delivery")).toBe(false);
    expect(canStartRide("Delivered")).toBe(false);
  });

  it("knows when the rider is already on the way", () => {
    expect(isOnTheWay("Out for Delivery")).toBe(true);
    expect(isOnTheWay("Picked Up")).toBe(false);
  });
});
