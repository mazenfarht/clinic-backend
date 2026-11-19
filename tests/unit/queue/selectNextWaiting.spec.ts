import { selectNextWaiting } from "../../../src/modules/queue/queue.service";

// Rows the fake client serves. checkedInAt is a real instant; clinic time in
// January is UTC+2 (Africa/Cairo), so 07:00Z is 09:00 on the clinic clock.
type Row = {
  id: string;
  queueNumber: number;
  status: "WAITING" | "IN_PROGRESS" | "SERVED" | "CANCELLED";
  isReserved?: boolean;
  checkedInAt: Date | null;
  skippedAt?: Date | null;
  servedAt?: Date | null;
  appointment?: string | null; // "HH:MM" clinic wall-clock, stored as UTC
};

const day = "2026-01-15";
const at = (hhmmZ: string) => new Date(`${day}T${hhmmZ}:00.000Z`);
const appt = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function fakeClient(rows: Row[]) {
  return {
    queueEntry: {
      findMany: jest.fn(async (args: any) => {
        const w = args.where;
        let list = rows.filter((r) => !w.status || r.status === w.status);

        // "reserved slot only counts once its patient was checked in"
        if (w.OR) {
          list = list.filter(
            (r) => !r.isReserved || r.checkedInAt !== null
          );
        }
        if (w.checkedInAt && w.checkedInAt.not === null) {
          list = list.filter((r) => r.checkedInAt !== null);
        }
        // served-after-skip query
        if (w.servedAt && w.servedAt.gt) {
          list = list.filter(
            (r) => r.servedAt && r.servedAt.getTime() > w.servedAt.gt.getTime()
          );
        }

        return list.map((r) => ({
          id: r.id,
          queueNumber: r.queueNumber,
          checkedInAt: r.checkedInAt,
          skippedAt: r.skippedAt ?? null,
          servedAt: r.servedAt ?? null,
          isReserved: r.isReserved ?? false,
          visit: r.appointment
            ? { appointment: { appointmentTime: appt(r.appointment) } }
            : null,
        }));
      }),
    },
  } as any;
}

const select = (rows: Row[]) =>
  selectNextWaiting(fakeClient(rows), "clinic", "doctor", new Date(day));

// Serves patients in the order the algorithm picks them, one minute apart,
// starting at `clock` (must be later than any skippedAt in the rows).
async function drain(
  rows: Row[],
  { clock = at("09:00"), limit = 50 }: { clock?: Date; limit?: number } = {}
): Promise<string[]> {
  const order: string[] = [];
  let time = clock.getTime();
  for (let i = 0; i < limit; i++) {
    const next = await select(rows);
    if (!next) break;
    order.push(next);
    const row = rows.find((r) => r.id === next)!;
    row.status = "SERVED";
    row.servedAt = new Date(time);
    time += 60_000;
  }
  return order;
}

// n walk-ins named after letters, arriving one minute apart from 07:00Z.
const walkIns = (names: string): Row[] =>
  names.split("").map((id, i) => ({
    id,
    queueNumber: i + 1,
    status: "WAITING" as const,
    checkedInAt: at(`07:${String(i).padStart(2, "0")}`),
  }));

describe("selectNextWaiting", () => {
  it("returns null when nobody is waiting", async () => {
    expect(await select([])).toBeNull();
  });

  describe("reserved slots", () => {
    it("never selects a reserved slot whose patient has not been checked in", async () => {
      const rows: Row[] = [
        { id: "reserved", queueNumber: 1, status: "WAITING", isReserved: true, checkedInAt: null },
      ];
      expect(await select(rows)).toBeNull();
    });

    it("selects the patient who is present, not the empty reserved slot ahead of them", async () => {
      const rows: Row[] = [
        { id: "reserved", queueNumber: 1, status: "WAITING", isReserved: true, checkedInAt: null },
        { id: "walkin", queueNumber: 2, status: "WAITING", checkedInAt: at("07:00") },
      ];
      expect(await drain(rows)).toEqual(["walkin"]);
    });

    it("once checked in, a reserved patient is served before walk-ins, even ones who arrived earlier", async () => {
      const rows: Row[] = [
        { id: "walkin", queueNumber: 2, status: "WAITING", checkedInAt: at("07:00") },
        { id: "reserved", queueNumber: 1, status: "WAITING", isReserved: true, checkedInAt: at("07:30") },
      ];
      expect(await drain(rows)).toEqual(["reserved", "walkin"]);
    });

    it("checked-in reserved patients follow their reserved numbers", async () => {
      const rows: Row[] = [
        { id: "reserved3", queueNumber: 3, status: "WAITING", isReserved: true, checkedInAt: at("07:00") },
        { id: "reserved1", queueNumber: 1, status: "WAITING", isReserved: true, checkedInAt: at("07:10") },
        { id: "reserved2", queueNumber: 2, status: "WAITING", isReserved: true, checkedInAt: at("07:05") },
      ];
      expect(await drain(rows)).toEqual(["reserved1", "reserved2", "reserved3"]);
    });

    it("scheduled patients still come before reserved patients", async () => {
      const rows: Row[] = [
        { id: "reserved", queueNumber: 1, status: "WAITING", isReserved: true, checkedInAt: at("05:00") },
        { id: "scheduled", queueNumber: 2, status: "WAITING", checkedInAt: at("06:00"), appointment: "09:00" },
      ];
      expect(await drain(rows)).toEqual(["scheduled", "reserved"]);
    });

    it("a reserved slot that is never checked in is never called, however long the queue runs", async () => {
      const rows: Row[] = [
        { id: "reserved", queueNumber: 1, status: "WAITING", isReserved: true, checkedInAt: null },
        ...walkIns("ab").map((r) => ({ ...r, queueNumber: r.queueNumber + 1 })),
      ];
      expect(await drain(rows)).toEqual(["a", "b"]);
    });
  });

  describe("walk-ins", () => {
    it("are served in arrival order", async () => {
      const rows: Row[] = [
        { id: "second", queueNumber: 1, status: "WAITING", checkedInAt: at("07:05") },
        { id: "first", queueNumber: 2, status: "WAITING", checkedInAt: at("07:00") },
      ];
      expect(await drain(rows)).toEqual(["first", "second"]);
    });

    it("come after scheduled patients", async () => {
      const rows: Row[] = [
        { id: "walkin", queueNumber: 1, status: "WAITING", checkedInAt: at("05:00") },
        { id: "scheduled", queueNumber: 2, status: "WAITING", checkedInAt: at("06:00"), appointment: "09:00" },
      ];
      expect(await drain(rows)).toEqual(["scheduled", "walkin"]);
    });
  });

  describe("skip: the patient returns after 3 other patients are served", () => {
    it("A -> B -> C -> D -> E with A skipped is served B, C, D, A, E", async () => {
      const rows = walkIns("ABCDE");
      rows[0].skippedAt = at("08:00");

      expect(await drain(rows)).toEqual(["B", "C", "D", "A", "E"]);
    });

    it("keeps the relative order of everybody else", async () => {
      const rows = walkIns("ABCDEFG");
      rows[2].skippedAt = at("08:00"); // skip C while A and B are still ahead

      // C returns after 3 OTHER patients (A, B, D) and takes its natural place
      // ahead of E, F, G, whose relative order never changes.
      expect(await drain(rows)).toEqual(["A", "B", "D", "C", "E", "F", "G"]);
    });

    it("the skipped patient is not called while 3 others have not been served yet", async () => {
      const rows = walkIns("ABCDE");
      rows[0].skippedAt = at("08:00");

      const first = await drain(rows, { limit: 1 });
      const second = await drain(rows, { limit: 1, clock: at("09:30") });
      expect([first[0], second[0]]).toEqual(["B", "C"]);
      expect(await select(rows)).toBe("D"); // only 2 served so far, A is still on hold
    });

    it("with fewer than 3 others waiting, the skipped patient comes back at the end", async () => {
      const rows = walkIns("ABC");
      rows[0].skippedAt = at("08:00");

      expect(await drain(rows)).toEqual(["B", "C", "A"]);
    });

    it("a patient who arrives during the hold counts toward the 3", async () => {
      const rows = walkIns("ABC");
      rows[0].skippedAt = at("08:00");
      rows.push({ id: "G", queueNumber: 4, status: "WAITING", checkedInAt: at("08:30") });

      expect(await drain(rows)).toEqual(["B", "C", "G", "A"]);
    });

    it("only patients served AFTER the skip count", async () => {
      const rows: Row[] = [
        ...walkIns("ABCD"),
        { id: "x", queueNumber: 5, status: "SERVED", checkedInAt: at("06:00"), servedAt: at("07:30") },
        { id: "y", queueNumber: 6, status: "SERVED", checkedInAt: at("06:01"), servedAt: at("07:40") },
        { id: "z", queueNumber: 7, status: "SERVED", checkedInAt: at("06:02"), servedAt: at("07:50") },
      ];
      rows[0].skippedAt = at("08:00"); // x, y, z were served BEFORE the skip

      expect((await drain(rows, { limit: 1 }))[0]).toBe("B");
    });

    it("cancelled patients are not examined, so they do not count", async () => {
      const rows: Row[] = [
        ...walkIns("ABCDE"),
        { id: "gone1", queueNumber: 6, status: "CANCELLED", checkedInAt: at("07:20") },
        { id: "gone2", queueNumber: 7, status: "CANCELLED", checkedInAt: at("07:21") },
        { id: "gone3", queueNumber: 8, status: "CANCELLED", checkedInAt: at("07:22") },
      ];
      rows[0].skippedAt = at("08:00");

      expect(await drain(rows)).toEqual(["B", "C", "D", "A", "E"]);
    });

    it("works again when the same patient is skipped twice", async () => {
      const rows = walkIns("ABCDEFGH");
      rows[0].skippedAt = at("08:00");

      // first round: B, C, D are served, then A rejoins
      expect(await drain(rows, { limit: 3 })).toEqual(["B", "C", "D"]);
      expect(await select(rows)).toBe("A");

      // A is called and skipped AGAIN (new skippedAt, after the services above)
      rows[0].skippedAt = at("10:00");

      expect(await drain(rows, { clock: at("10:05") })).toEqual([
        "E", "F", "G", "A", "H",
      ]);
    });

    it("a second skip with too few others waiting still ends with the patient being called", async () => {
      const rows = walkIns("ABCDE");
      rows[0].skippedAt = at("08:00");
      await drain(rows, { limit: 3 }); // B, C, D
      rows[0].skippedAt = at("10:00"); // skipped again, only E is left

      expect(await drain(rows, { clock: at("10:05") })).toEqual(["E", "A"]);
    });

    it("two skipped patients return in the order they were skipped", async () => {
      const rows = walkIns("ABCDEFG");
      rows[0].skippedAt = at("08:00");
      rows[1].skippedAt = at("08:10");

      expect(await drain(rows)).toEqual(["C", "D", "E", "A", "B", "F", "G"]);
    });

    it("a skipped scheduled patient waits behind later appointments, then rejoins", async () => {
      const rows: Row[] = [
        { id: "s0900", queueNumber: 1, status: "WAITING", checkedInAt: at("06:50"), appointment: "09:00", skippedAt: at("07:05") },
        { id: "s0930", queueNumber: 2, status: "WAITING", checkedInAt: at("07:00"), appointment: "09:30" },
        { id: "s1000", queueNumber: 3, status: "WAITING", checkedInAt: at("07:00"), appointment: "10:00" },
        { id: "s1030", queueNumber: 4, status: "WAITING", checkedInAt: at("07:00"), appointment: "10:30" },
        { id: "s1100", queueNumber: 5, status: "WAITING", checkedInAt: at("07:00"), appointment: "11:00" },
      ];
      expect(await drain(rows)).toEqual(["s0930", "s1000", "s1030", "s0900", "s1100"]);
    });

    it("a skipped patient with nobody else waiting is called straight away", async () => {
      const rows = walkIns("A");
      rows[0].skippedAt = at("08:00");
      expect(await select(rows)).toBe("A");
    });
  });

  describe("late patients (existing rule must keep working)", () => {
    it("a late patient waits for up to 3 later checked-in patients", async () => {
      const rows: Row[] = [
        { id: "A-late", queueNumber: 1, status: "WAITING", checkedInAt: at("08:00"), appointment: "09:00" }, // 10:00 > 09:00
        { id: "B", queueNumber: 2, status: "WAITING", checkedInAt: at("06:30"), appointment: "09:30" },
        { id: "C", queueNumber: 3, status: "WAITING", checkedInAt: at("07:00"), appointment: "10:00" },
        { id: "D", queueNumber: 4, status: "WAITING", checkedInAt: at("07:30"), appointment: "10:30" },
        { id: "E", queueNumber: 5, status: "WAITING", checkedInAt: at("07:40"), appointment: "11:00" },
      ];
      expect(await drain(rows)).toEqual(["B", "C", "D", "A-late", "E"]);
    });

    it("a late patient with nobody after them is called immediately", async () => {
      const rows: Row[] = [
        { id: "A-late", queueNumber: 1, status: "WAITING", checkedInAt: at("08:00"), appointment: "09:00" },
      ];
      expect(await select(rows)).toBe("A-late");
    });
  });
});
