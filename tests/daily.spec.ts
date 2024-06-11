import { test, expect } from "@playwright/test";
import { compareAsc, parseISO, addMinutes, isBefore, isEqual } from "date-fns";
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

interface AppointmentsResponse {
  sucess: boolean;
  info: string[];
  data: {
    appointments: (
      | { state: "deleted" }
      | {
          state: "booked";
          time: string;
          time_datepart: string;
          time_timepart: string;
          paid_online: boolean;
          paid_online_amount: null | number;
          customer_full_name: string;
          data: {
            staff_member_treatment: {
              total_duration: number;
              price: number;
              name: string;
            };
          };
        }
    )[];
  };
  appointments_count: 11;
}

function formatData(
  appointment: Exclude<
    AppointmentsResponse["data"]["appointments"][0],
    { state: "deleted" }
  >
) {
  const date = parseISO(appointment.time);
  const utcDate = fromZonedTime(date, "Europe/Berlin"); // 'Europe/Berlin' is in UTC+2 during the summer
  const formattedDate = format(utcDate, "yyyy-MM-dd HH:mm", {
    timeZone: "Europe/Berlin",
  });
  const duration = appointment.data.staff_member_treatment.total_duration / 60;

  return {
    name: appointment.customer_full_name,
    startTime: formattedDate,
    endTime: format(addMinutes(utcDate, duration), "yyyy-MM-dd HH:mm", {
      timeZone: "Europe/Berlin",
    }),
    duration,
    treatmentName: appointment.data.staff_member_treatment.name,
    paidOnline: appointment.paid_online,
    price: appointment.data.staff_member_treatment.price,
  };
}

function merge_appointment_data(current_appointment: ReturnType<typeof formatData>, new_appointment: ReturnType<typeof formatData>) {
  const merged_appointment = {
    ...current_appointment,
  }

  const current_date = parseISO(current_appointment.startTime);
  const current_utc_date = fromZonedTime(current_date, "Europe/Berlin"); // 'Europe/Berlin' is in UTC+2 during the summer

  const new_date = parseISO(new_appointment.startTime);
  const new_utc_date = fromZonedTime(new_date, "Europe/Berlin"); // 'Europe/Berlin' is in UTC+2 during the summer
  merged_appointment.duration = current_appointment.duration + new_appointment.duration

  if (isBefore(new_date, current_date)) {
    merged_appointment.startTime = new_appointment.startTime
    merged_appointment.endTime = format(addMinutes(new_utc_date, merged_appointment.duration), "yyyy-MM-dd HH:mm", {
      timeZone: "Europe/Berlin",
    })
  } else {
    merged_appointment.endTime = format(addMinutes(current_utc_date, merged_appointment.duration), "yyyy-MM-dd HH:mm", {
      timeZone: "Europe/Berlin",
    })
  }

  merged_appointment.treatmentName = `${merged_appointment.treatmentName}, ${new_appointment.treatmentName}`

  return merged_appointment;
}

test("get current appointsments", async ({ page }) => {
  await page.route(
    "https://api.uala.com/api/v1/venues/66405/appointments.json?from_time=2024-05-23T00%3A00%3A00Z&to_time=2024-05-23T23%3A59%3A59Z",
    async (route) => {
      const response = await route.fetch();

      const body: AppointmentsResponse = await response.json();

      console.log("ASDASD")

      const group_by_customer_name = body.data.appointments.reduce(
        (acc, appointment) => {
          if (appointment.state === "deleted") {
            return acc;
          }

          const new_appointment = formatData(appointment);

          // biome-ignore lint/suspicious/noDoubleEquals: <explanation>
          if (acc[appointment.customer_full_name] != undefined) {
            acc[appointment.customer_full_name] = merge_appointment_data(
              acc[appointment.customer_full_name],
              new_appointment
            );
            return acc;
          }

          acc[appointment.customer_full_name] = new_appointment;

          return acc;
        },
        {}
      );

      console.log(group_by_customer_name);

      await route.fulfill({
        response,
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        body: body as any,
        headers: response.headers(),
      });
    }
  );

  await page.goto('');

  // Expect a title "to contain" a substring.
  await page.getByPlaceholder("Email").fill("placeholder");
  await page.getByPlaceholder("Contraseña").fill("placeholder");
  await page.getByRole("button", { name: "Acceder" }).click();

  await expect(page.getByText("Fernando")).toBeVisible();
});
