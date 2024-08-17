import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'primereact/chart';
import { Calendar } from 'primereact/calendar';
import { MultiSelect } from 'primereact/multiselect';
import dayjs from 'dayjs';
import { StatsData, UserInfo } from './types';
import { getDemandStats } from './api';

import { InProgress } from './common-ui';

interface DemandChartProps {
    data: any;
}

interface StatsProps {
    userInfo: UserInfo,
}

export function Stats({ userInfo }: StatsProps) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<StatsData>({
        totalDemands: [],
        fulfilledDemands: [],
        labels: [],
    });
    const [dateRange, setDateRange] = useState<[Date, Date | null] | null>(null);
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const calendar = useRef<Calendar>(null);

    useEffect(() => {
        if (userInfo?.isAdmin && dateRange && selectedDistricts.length > 0) {
            setLoading(true);
            getDemandStats(dateRange, selectedDistricts).then(setData).finally(() => setLoading(false));
        }
    }, [dateRange, selectedDistricts, userInfo]);

    useEffect(() => {
        if (userInfo?.isAdmin && userInfo.districts?.length == 1) {
            setSelectedDistricts([userInfo.districts[0].id]);
        }
    }, [userInfo]);

    const handleDateChange = (e: any) => {
        if (!e.value || e.value.length !== 2) return;

        const [start, end] = e.value;

        const startOfWeek = dayjs(start).startOf('week').toDate();
        const endOfWeek = end ? dayjs(end).endOf('week').toDate() : null;
        setDateRange([startOfWeek, endOfWeek]);
        if (endOfWeek) {
            calendar.current?.hide();
        }
    };

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    return (
        <div>
            <Calendar
                ref={calendar}
                value={dateRange}
                onChange={handleDateChange}
                selectionMode="range"
                placeholder="בחר שבוע או מס׳ שבועות"
                readOnlyInput
            />

            {userInfo && userInfo.districts && userInfo.districts.length > 1 &&
                <MultiSelect
                    value={selectedDistricts}
                    options={userInfo?.districts?.map(d => ({ label: d.name, value: d.id })) || []}
                    onChange={handleDistrictChange}
                    placeholder="בחר מחוזות"
                    display="chip"
                    className="w-full md:w-20rem mt-3"
                />}

            {error && <small style={{ color: 'red' }}>{error}</small>}
            {loading && <InProgress />}
            <DemandChart data={data} />
        </div>
    );
}


export const DemandChart: React.FC<DemandChartProps> = ({ data }) => {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'סה״כ ביקוש',
                data: data.totalDemands,
                fill: false,
                borderColor: '#42A5F5',
                tension: 0.1,
            },
            {
                label: 'ביקוש שקיבל מענה',
                data: data.fulfilledDemands,
                fill: false,
                borderColor: '#66BB6A',
                tension: 0.1,
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1,  // Forces the y-axis to increment by 1
                    callback: function (value: number) {
                        return Number.isInteger(value) ? value : null;
                    }
                }
            }
        }
    };

    return <Chart type="line" data={chartData} options={options} />;
};

