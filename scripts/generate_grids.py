#!/usr/bin/env python3
"""
Generate synthetic GFS weather data files derived from the bundled surface
wind file so that every earth.js menu option (Temp, RH, Air Density, WPD,
TPW, TCW, MSLP overlays and altitude wind levels 1000/850/700/500/250/70/10
hPa) has a data file to load instead of 404ing.

The grid is 360x181 (1 deg), identical to the bundled wind file. Each
generated file reuses that header template with adjusted parameter metadata
and a data array synthesized from latitude-based realistic-ish patterns.
RH and air_density are written in the NetCDF-JSON shape the builders expect
(file.variables), everything else uses the GRIB-JSON shape ([{header,data}]).

This is approximation data for visualization only, not real GFS output.
"""
import json, math, os, copy

CUR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data", "weather", "current")
WIND_FILE = os.path.join(CUR_DIR, "current-wind-surface-level-gfs-1.0.json")

with open(WIND_FILE) as f:
    wind = json.load(f)
u_header = wind[0]["header"]

NX, NY = u_header["nx"], u_header["ny"]   # 360, 181
LO1, LA1 = u_header["lo1"], u_header["la1"]  # 0, 90
DX, DY = u_header["dx"], u_header["dy"]   # 1, 1

lats = [LA1 - j * DY for j in range(NY)]

CAT_NAMES = {0: "Temperature", 2: "Momentum", 1: "Moisture", 3: "Mass", 6: "Cloud"}
SURFACE = (103, "Specified height level above ground", 10)


def write_grib(name, param_cat, param_num, param_num_name, param_unit, s1type, s1name, s1val, data):
    h = copy.deepcopy(u_header)
    h.update({
        "parameterCategory": param_cat,
        "parameterCategoryName": CAT_NAMES.get(param_cat, ""),
        "parameterNumber": param_num,
        "parameterNumberName": param_num_name,
        "parameterUnit": param_unit,
        "surface1Type": s1type,
        "surface1TypeName": s1name,
        "surface1Value": s1val,
        "surface2Type": 255,
        "surface2TypeName": "Missing",
        "surface2Value": 0,
    })
    with open(os.path.join(CUR_DIR, name), "w") as f:
        json.dump([{"header": h, "data": data}], f, separators=(",", ":"))
    print("wrote", name, len(data))


def write_netcdf(name, var_name, data):
    obj = {
        "Originating_or_generating_Center": u_header["centerName"],
        "variables": {
            "time": {"data": [u_header["refTime"]], "shape": [1]},
            "lat": {"sequence": {"start": LA1, "delta": -DY, "size": NY}, "shape": [NY]},
            "lon": {"sequence": {"start": LO1, "delta": DX, "size": NX}, "shape": [NX]},
            var_name: {"data": data, "shape": [NY, NX]},
        },
    }
    with open(os.path.join(CUR_DIR, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print("wrote", name, len(data))


def temp_k(level_hpa):
    lapse = max(0.0, (1000 - level_hpa) / 1000.0) * 35.0
    data = []
    for j in range(NY):
        lat = lats[j]
        base = 288.0 - 35.0 * (abs(lat) / 90.0) - lapse
        for i in range(NX):
            lon = LO1 + i * DX
            data.append(round(base + 4.0 * math.sin(math.radians(lon * 2 + lat)), 2))
    return data


def rh_pct(level_hpa):
    data = []
    for j in range(NY):
        lat = lats[j]
        base = 80.0 - 50.0 * (abs(lat) / 90.0)
        for i in range(NX):
            lon = LO1 + i * DX
            data.append(round(max(5.0, min(100.0, base + 15.0 * math.sin(math.radians(lon * 3 + lat * 2)))), 1))
    return data


def air_density(level_hpa):
    ratio = max(0.05, level_hpa / 1013.25)
    data = []
    for j in range(NY):
        lat = lats[j]
        base = 1.225 * ratio * (1.0 - 0.15 * (abs(lat) / 90.0))
        for i in range(NX):
            data.append(round(base + 0.01 * math.sin(i * 0.1 + j * 0.1), 3))
    return data


def total_cloud_water():
    data = []
    for j in range(NY):
        lat = lats[j]
        base = 0.6 * math.exp(-((abs(lat)) / 30.0) ** 2)
        for i in range(NX):
            lon = LO1 + i * DX
            data.append(round(max(0.0, base + 0.15 * math.sin(math.radians(lon * 2 + lat))), 3))
    return data


def total_precipitable_water():
    data = []
    for j in range(NY):
        lat = lats[j]
        base = 50.0 * math.exp(-((abs(lat)) / 25.0) ** 2)
        for i in range(NX):
            lon = LO1 + i * DX
            data.append(round(max(0.0, base + 8.0 * math.sin(math.radians(lon * 2 + lat))), 2))
    return data


def mslp():
    data = []
    for j in range(NY):
        lat = lats[j]
        base = 101325.0 + 1500.0 * math.cos(math.radians(lat * 2))
        for i in range(NX):
            lon = LO1 + i * DX
            data.append(round(base + 400.0 * math.sin(math.radians(lon * 2 + lat)), 0))
    return data


levels = [1000, 850, 700, 500, 250, 70, 10]

write_grib("current-temp-surface-level-gfs-1.0.json", 0, 0, "Temperature", "K",
           SURFACE[0], SURFACE[1], SURFACE[2], temp_k(1013))
write_grib("current-total_cloud_water-gfs-1.0.json", 1, 6, "Total_cloud_water", "kg.m-2",
           SURFACE[0], SURFACE[1], SURFACE[2], total_cloud_water())
write_grib("current-total_precipitable_water-gfs-1.0.json", 1, 3, "Total_precipitable_water", "kg.m-2",
           SURFACE[0], SURFACE[1], SURFACE[2], total_precipitable_water())
write_grib("current-mean_sea_level_pressure-gfs-1.0.json", 3, 0, "Pressure_reduced_to_MSL", "Pa",
           SURFACE[0], SURFACE[1], SURFACE[2], mslp())
write_netcdf("current-relative_humidity-surface-level-gfs-1.0.json",
             "Relative_humidity_height_above_ground", rh_pct(1013))
write_netcdf("current-air_density-surface-level-gfs-1.0.json", "air_density", air_density(1013))

for hpa in levels:
    lvl = hpa * 100
    recs = []
    for rec in wind:
        h = copy.deepcopy(rec["header"])
        h["surface1Type"] = 100
        h["surface1TypeName"] = "Isobaric surface"
        h["surface1Value"] = float(lvl)
        recs.append({"header": h, "data": rec["data"]})
    fname = "current-wind-isobaric-{}hPa-gfs-1.0.json".format(hpa)
    with open(os.path.join(CUR_DIR, fname), "w") as f:
        json.dump(recs, f, separators=(",", ":"))
    print("wrote", fname)

    write_grib("current-temp-isobaric-{}hPa-gfs-1.0.json".format(hpa), 0, 0, "Temperature", "K",
               100, "Isobaric surface", float(lvl), temp_k(hpa))
    write_netcdf("current-relative_humidity-isobaric-{}hPa-gfs-1.0.json".format(hpa),
                 "Relative_humidity_isobaric", rh_pct(hpa))
    write_netcdf("current-air_density-isobaric-{}hPa-gfs-1.0.json".format(hpa),
                 "air_density", air_density(hpa))

print("done")
