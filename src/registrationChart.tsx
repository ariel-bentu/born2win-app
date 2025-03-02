import dayjs, { Dayjs } from "dayjs";
import { FamilyDemand } from "./types";
import { useEffect } from "react";
import { dateInRange, sortByDate } from "./utils";
import { getColorForDay } from "./charts";


export function getDemandSupplyChart(data: FamilyDemand[], startDate: Dayjs, endDate: Dayjs) {
    const labels: string[] = [];
    const fulfilledDemands: number[] = [];
    const totalDemands: number[] = [];
    const weekdayCounts: { [key: string]: number[] } = {
        ראשון: [],
        שני: [],
        שלישי: [],
        רביעי: [],
        חמישי: [],
        שישי: [],
    };

    const today = dayjs().startOf("day");

    data.forEach(demand => {

        if (!dateInRange(demand.date, startDate, endDate)) return;

        const recordDate = dayjs(demand.date).startOf("day");
        const daysDiff = recordDate.diff(today, "days");
        const daysRound2Week = Math.floor(daysDiff / 7);
        const weekLabel =
            daysDiff >= 0 && daysDiff <= 6
                ? "היום"
                : today.add(daysRound2Week * 7, "days").format("DD-MM");

        let index = labels.findIndex(l => l === weekLabel);
        if (index < 0) {
            labels.push(weekLabel);
            fulfilledDemands.push(0);
            totalDemands.push(0);
            index = labels.length - 1;

            // Initialize weekday counts for this week
            Object.keys(weekdayCounts).forEach(day => {
                weekdayCounts[day].push(0);
            });
        }

        totalDemands[index]++;
        if (demand.status === "תפוס") {
            fulfilledDemands[index]++;
        }

        // Increment weekday count
        const weekday = recordDate.format("dddd"); // Get the weekday name
        weekdayCounts[weekday][index]++;
    });

    const chartData = {
        labels: labels,
        datasets: [
            {
                type: "line",
                label: "סה״כ",
                data: totalDemands,
                fill: false,
                borderColor: "#42A5F5",
                tension: 0.1,
            },
            {
                type: "line",
                label: "שובצו",
                data: fulfilledDemands,
                fill: false,
                borderColor: "#66BB6A",
                tension: 0.1,
            },
            // Add datasets for weekdays
            ...Object.keys(weekdayCounts).map((day, i) => ({
                type: "bar",
                label: day,
                data: weekdayCounts[day],
                backgroundColor: getColorForDay(day), // Assign a unique color to each weekday
            }))
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: "bottom",
            },
            datalabels: {
                display: true,
                align: 'center',
                textAlign: "center",
                anchor: 'center',
                color: "white",
                formatter: function (value: any) {
                    return value == 0 ? "" : value
                }

            }
        },
        scales: {
            x: {
                stacked: false, // Disable stacking to display bars side by side
            },
            y: {
                stacked: false, // Ensure side-by-side behavior for y-axis as well
                beginAtZero: true,
                ticks: {
                    stepSize: 1,
                    callback: function (value: number) {
                        return Number.isInteger(value) ? value : null;
                    },
                },
            },
        },
    };
    return { chartData, options };
}


export function getRegistrationChart(data: FamilyDemand[], startDate: Dayjs, endDate: Dayjs) {
    const labels: string[] = [];
    const fulfilledDemands: number[] = [];
    const weekdayCounts: { [key: string]: number[][] } = {
        ראשון: [],
        שני: [],
        שלישי: [],
        רביעי: [],
        חמישי: [],
        שישי: [],
        שבת: [],
    };

    const today = dayjs().startOf("day");
    const weekDayLabels: string[] = [];
    const weeksLabel: string[] = []
    const hoursData: number[][] = [[], [], [], []];
    const orderedData = [...data].sort((d1, d2) => sortByDate(d1.modifiedDate, d2.modifiedDate));
    orderedData.forEach(demand => {
        if (demand.status != "תפוס" || !dateInRange(demand.modifiedDate, startDate, endDate)) return;
        const recordDate = dayjs(demand.modifiedDate).startOf("day");
        const daysDiff = recordDate.diff(today, "days");
        const daysRound2Week = Math.floor(daysDiff / 7);
        const weekLabel =
            daysDiff >= 0 && daysDiff <= 6
                ? "היום"
                : today.add(daysRound2Week * 7, "days").format("DD-MM");

        let index = weeksLabel.findIndex(l => l === weekLabel);
        if (index < 0) {
            fulfilledDemands.push(0);
            weeksLabel.push(weekLabel);
            index = weeksLabel.length - 1;
            Object.keys(weekdayCounts).forEach((k: string) => weekDayLabels.push(k));
            hoursData.forEach(h => h.push(0, 0, 0, 0, 0, 0, 0));
        }

        // Increment weekday count

        const hour = dayjs(demand.modifiedDate).hour();
        const weekday = dayjs(demand.modifiedDate).day()
        let hourGroup = 0; // 02:00 -11:59
        if (hour >= 12 && hour < 16) {
            hourGroup = 1;
        } else if (hour >= 16 && hour < 20) {
            hourGroup = 2;
        } else if (hour >= 20 && hour <= 2) {
            hourGroup = 3;
        }
        hoursData[hourGroup][index * 7 + weekday]++
        fulfilledDemands[index]++;
    });

    const weekPointIndex = 3; // Wednesday
    const paddedFulfilledDemands: (number | undefined)[] = fulfilledDemands.flatMap(val => {
        const arr = new Array(7).fill(undefined);
        arr[weekPointIndex] = val;
        return arr;
    });
    const chartData = {
        labels: weekDayLabels,
        datasets: [
            {
                type: "line",
                label: "שובצו",
                data: paddedFulfilledDemands    ,
                fill: false,
                borderColor: "#66BB6A",
                tension: 0.1,
                spanGaps: true,
            },
            {
                label: '02:00-12:00',
                data: hoursData[0],
                backgroundColor: "green",
                borderColor: 'rgb(124, 181, 236)',
                borderWidth: 1,
                stack: "a"
            },
            {
                label: '12:00-16:00',
                data: hoursData[1],
                backgroundColor: "blue",
                borderColor: 'rgb(67, 67, 72)',
                borderWidth: 1,
                stack: "a"
            },
            {
                label: '16:00:20:00',
                data: hoursData[2],
                backgroundColor: "red",
                borderColor: 'rgb(67, 67, 72)',
                borderWidth: 1,
                stack: "a"
            },
            {
                label: '20:00-02:00',
                data: hoursData[3],
                backgroundColor: "brown",
                borderColor: 'rgb(67, 67, 72)',
                borderWidth: 1,
                stack: "a"
            }

        ]
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: "top",
            },
            datalabels: {
                display: true,
                align: 'center',
                textAlign: "center",
                anchor: 'center',
                color: "white",
                formatter: function (value: any) {
                    return value == 0 ? "" : value
                }

            }

        },
        scales: {
            x:
            {
                stacked: true,
                offset: true,
            },
            secondX: {
                position: 'bottom',
                labels: weeksLabel,
                grid: {
                    // Draw vertical grid lines for each tick except the last one.
                    drawOnChartArea: false,
                    // color: function(context: any) {
                    //     // context.tick.index gives the index.
                    //     // Only draw grid line if this is not the last tick.
                    //     const index = context.tick.index;
                    //     return index < weeksLabel.length - 1 ? "black" : "transparent";
                    // },
                    borderWidth: 2,
                    color: "black",
                    tickLength: 15,
                }
            },
            y: {
                stacked: true,
            },
        },
    };
    return { chartData, options };
}