document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const temperatureInput = document.getElementById('temperature');
    const rtdValueInput = document.getElementById('rtd-value');
    const tcValueInput = document.getElementById('tc-value');
    const rtdTypeSelect = document.getElementById('rtd-type');
    const tcTypeSelect = document.getElementById('tc-type');
    const tempError = document.getElementById('temp-error');
    const rtdError = document.getElementById('rtd-error');
    const tcError = document.getElementById('tc-error');
    const tempRangeInfo = document.getElementById('temp-range-info');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const rtdSection = document.getElementById('rtd-section');
    const tcSection = document.getElementById('tc-section');
    const rtdInfo = document.getElementById('rtd-info');
    const tcInfo = document.getElementById('tc-info');
    
    // 当前激活的传感器类型
    let activeSensorType = 'rtd'; // 'rtd' 或 'tc'
    
    // 温度和传感器值更新锁，防止循环更新
    let isUpdatingTemp = false;
    let isUpdatingRtd = false;
    let isUpdatingTc = false;
    
    // 传感器温度范围
    const sensorRanges = {
        // 热电阻
        'PT100': { min: -200, max: 850 },
        'PT1000': { min: -200, max: 850 },
        'Cu50': { min: -50, max: 150 },
        'Ni120': { min: -60, max: 180 },
        // 热电偶
        'K': { min: -270, max: 1372 },
        'J': { min: -210, max: 1200 },
        'T': { min: -270, max: 400 },
        'E': { min: -270, max: 1000 },
        'N': { min: -270, max: 1300 },
        'R': { min: -50, max: 1768 },
        'S': { min: -50, max: 1768 },
        'B': { min: 0, max: 1820 }
    };
    
    // ================== 热电阻转换公式 ==================
    
    // PT100/PT1000常数 (IEC 60751标准)
    const PT_A = 3.9083e-3;
    const PT_B = -5.775e-7;
    const PT_C = -4.183e-12;
    
    // Cu50常数 (GB/T 17621-1998标准)
    const CU_A = 4.28e-3;
    const CU_B = -6.2032e-7;
    const CU_C = 8.5154e-10;
    
    // Ni120常数 (DIN 43760标准)
    const NI_A = 5.485e-3;
    const NI_B = 6.65e-6;
    const NI_C = 2.805e-11;
    
    // 温度到电阻转换
    function calculateRTDResistance(temp, type) {
        const range = sensorRanges[type];
        
        // 验证温度范围
        if (temp < range.min || temp > range.max) {
            return null;
        }
        
        let r0, a, b, c;
        
        switch (type) {
            case 'PT100':
                r0 = 100;
                a = PT_A;
                b = PT_B;
                c = PT_C;
                break;
            case 'PT1000':
                r0 = 1000;
                a = PT_A;
                b = PT_B;
                c = PT_C;
                break;
            case 'Cu50':
                r0 = 50;
                a = CU_A;
                b = CU_B;
                c = CU_C;
                
                if (temp >= 0) {
                    return r0 * (1 + a * temp + b * temp * temp);
                } else {
                    return r0 * (1 + a * temp);
                }
            case 'Ni120':
                r0 = 120;
                a = NI_A;
                b = NI_B;
                c = NI_C;
                
                return r0 * (1 + a * temp + b * temp * temp + c * temp * temp * temp * temp);
        }
        
        // PT100/PT1000标准公式
        if (temp >= 0) {
            return r0 * (1 + a * temp + b * temp * temp);
        } else {
            return r0 * (1 + a * temp + b * temp * temp + c * (temp - 100) * temp * temp * temp);
        }
    }
    
    // 电阻到温度转换
    function calculateRTDTemperature(resistance, type) {
        let r0, a, b, c;
        
        switch (type) {
            case 'PT100':
                r0 = 100;
                a = PT_A;
                b = PT_B;
                c = PT_C;
                break;
            case 'PT1000':
                r0 = 1000;
                a = PT_A;
                b = PT_B;
                c = PT_C;
                break;
            case 'Cu50':
                r0 = 50;
                a = CU_A;
                b = CU_B;
                // 铜电阻的计算
                const ratio = resistance / r0;
                if (ratio >= 1) {
                    // 正温度使用二次方程
                    const c = 1 - ratio;
                    const discr = a * a - 4 * b * c;
                    return (-a + Math.sqrt(discr)) / (2 * b);
                } else {
                    // 负温度使用线性关系
                    return (ratio - 1) / a;
                }
            case 'Ni120':
                // 镍电阻需要使用迭代法求解
                r0 = 120;
                const range = sensorRanges[type];
                return iterativeTemperatureCalc(resistance, range.min, range.max, function(t) {
                    return calculateRTDResistance(t, 'Ni120');
                });
        }
        
        // PT100/PT1000的计算
        const ratio = resistance / r0;
        
        if (ratio >= 1) {
            // 正温度 (≥0°C)
            // 使用二次方程公式求解
            const c = 1 - ratio;
            const discr = a * a - 4 * b * c;
            return (-a + Math.sqrt(discr)) / (2 * b);
        } else {
            // 负温度 (<0°C)
            // 使用迭代法求解
            return iterativeTemperatureCalc(resistance, -200, 0, function(t) {
                return calculateRTDResistance(t, type);
            });
        }
    }
    
    // ================== 热电偶转换公式 ==================
    
    // IEC 60584标准热电偶系数
    const tcCoefficients = {
        'K': {
            // 范围：-270°C到1372°C
            ranges: [
                { min: -270, max: 0, coeffs: [0, 0.394501280250E-1, 0.236223735980E-4, -0.328589067840E-6, -0.499048287770E-8, -0.675090591730E-10, -0.574103274280E-12, -0.310888728940E-14, -0.104516093650E-16, -0.198892668780E-19, -0.163226974860E-22] },
                { min: 0, max: 1372, coeffs: [-0.176004136860E-1, 0.389212049750E-1, 0.185587700320E-4, -0.994575928740E-7, 0.318409457190E-9, -0.560728448890E-12, 0.560750590590E-15, -0.320207200030E-18, 0.971511471520E-22, -0.121047212750E-25] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -5.891, max: 0, coeffs: [0.0000000E+00, 2.5173462E+01, -1.1662878E+00, -1.0833638E+00, -8.9773540E-01, -3.7342377E-01, -8.6632643E-02, -1.0450598E-02, -5.1920577E-04] },
                { min: 0, max: 20.644, coeffs: [0.000000E+00, 2.508355E+01, 7.860106E-02, -2.503131E-01, 8.315270E-02, -1.228034E-02, 9.804036E-04, -4.413030E-05, 1.057734E-06, -1.052755E-08] },
                { min: 20.644, max: 54.886, coeffs: [-1.318058E+02, 4.830222E+01, -1.646031E+00, 5.464731E-02, -9.650715E-04, 8.802193E-06, -3.110810E-08] }
            ]
        },
        'J': {
            // 范围：-210°C到1200°C
            ranges: [
                { min: -210, max: 760, coeffs: [0, 0.503811878150E-1, 0.304758369300E-4, -0.856810657200E-7, 0.132281952950E-9, -0.170529583370E-12, 0.209480906970E-15, -0.125383953360E-18, 0.156317256970E-22] },
                { min: 760, max: 1200, coeffs: [0.296456256810E+3, -0.149761277860E+1, 0.317871039240E-2, -0.318476867010E-5, 0.157208190040E-8, -0.306913690560E-12] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -8.095, max: 0, coeffs: [0.0000000E+00, 1.9528268E+01, -1.2286185E+00, -1.0752178E+00, -5.9086933E-01, -1.7256713E-01, -2.8131513E-02, -2.3963370E-03, -8.3823321E-05] },
                { min: 0, max: 42.919, coeffs: [0.000000E+00, 1.978425E+01, -2.001204E-01, 1.036969E-02, -2.549687E-04, 3.585153E-06, -5.344285E-08, 5.099890E-10] },
                { min: 42.919, max: 69.553, coeffs: [-3.11358187E+03, 3.00543684E+02, -9.94773230E+00, 1.70276630E-01, -1.43033468E-03, 4.73886084E-06] }
            ]
        },
        // 其他热电偶类型的系数将类似添加
        'T': {
            // 范围：-270°C到400°C
            ranges: [
                { min: -270, max: 0, coeffs: [0, 0.387481063640E-1, 0.441944343470E-4, 0.118443231050E-6, 0.200329735540E-7, 0.901380195590E-9, 0.226511565930E-10, 0.360711542050E-12, 0.384939398830E-14, 0.282135219250E-16, 0.142515947790E-18, 0.487686622860E-21, 0.107955392700E-23, 0.139450270620E-26, 0.797951539270E-30] },
                { min: 0, max: 400, coeffs: [0, 0.387481063640E-1, 0.332922278800E-4, 0.206182434040E-6, -0.218822568460E-8, 0.109968809280E-10, -0.308157587720E-13, 0.454791352900E-16, -0.275129016730E-19] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -5.603, max: 0, coeffs: [0.0000000E+00, 2.5949192E+01, -2.1316967E-01, 7.9018692E-01, 4.2527777E-01, 1.3304473E-01, 2.0241446E-02, 1.2668171E-03] },
                { min: 0, max: 20.872, coeffs: [0.000000E+00, 2.592800E+01, -7.602961E-01, 4.637791E-02, -2.165394E-03, 6.048144E-05, -7.293422E-07] }
            ]
        },
        'E': {
            // 范围：-270°C到1000°C
            ranges: [
                { min: -270, max: 0, coeffs: [0, 0.586655087080E-1, 0.454109771240E-4, -0.779980486860E-6, -0.258001608430E-7, -0.594525830570E-9, -0.932140586670E-11, -0.102876055340E-12, -0.803701236210E-15, -0.439794973910E-17, -0.164147763550E-19, -0.396736195160E-22, -0.558273287210E-25, -0.346578420130E-28] },
                { min: 0, max: 1000, coeffs: [0, 0.586655087100E-1, 0.450322755820E-4, 0.289084072120E-7, -0.330568966520E-9, 0.650244032700E-12, -0.191974955040E-15, -0.125366004970E-17, 0.214892175690E-20, -0.143880417820E-23, 0.359608994810E-27] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -8.825, max: 0, coeffs: [0.0000000E+00, 1.6977288E+01, -4.3514970E-01, -1.5859697E-01, -9.2502871E-02, -2.6084314E-02, -4.1360199E-03, -3.4034030E-04, -1.1564890E-05] },
                { min: 0, max: 76.373, coeffs: [0.0000000E+00, 1.7057035E+01, -2.3301759E-01, 6.5435585E-03, -7.3562749E-05, -1.7896001E-06, 8.4036165E-08, -1.3735879E-09, 1.0629823E-11, -3.2447087E-14] }
            ]
        },
        'N': {
            // 范围：-270°C到1300°C
            ranges: [
                { min: -270, max: 0, coeffs: [0, 0.261591059620E-1, 0.109574842280E-4, -0.938411115540E-7, -0.464120397590E-10, -0.263033577160E-11, -0.226534380030E-13, -0.760893007910E-16, -0.934196678350E-19] },
                { min: 0, max: 1300, coeffs: [0, 0.259293946010E-1, 0.157101418800E-4, 0.438256272370E-7, -0.252611697940E-9, 0.643118193390E-12, -0.100634715190E-14, 0.997453389920E-18, -0.608632456070E-21, 0.208492293390E-24, -0.306821961510E-28] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -3.99, max: 0, coeffs: [0.0000000E+00, 3.8436847E+01, 1.1010485E+00, 5.2229312E+00, 7.2060525E+00, 5.8488586E+00, 2.7754916E+00, 7.7075166E-01, 1.1582665E-01, 7.3138868E-03] },
                { min: 0, max: 20.613, coeffs: [0.00000E+00, 3.86896E+01, -1.08267E+00, 4.70205E-02, -2.12169E-06, -1.17272E-04, 5.39280E-06, -7.98156E-08] },
                { min: 20.613, max: 47.513, coeffs: [1.972485E+01, 3.300943E+01, -3.915159E-01, 9.855391E-03, -1.274371E-04, 7.767022E-07] }
            ]
        },
        'R': {
            // 范围：-50°C到1768°C
            ranges: [
                { min: -50, max: 1064.18, coeffs: [0, 0.528961729765E-2, 0.139166589782E-4, -0.238855693017E-7, 0.356916001063E-10, -0.462347666298E-13, 0.500777441034E-16, -0.373105886191E-19, 0.157716482367E-22, -0.281038625251E-26] },
                { min: 1064.18, max: 1664.5, coeffs: [0.295157925316E+1, -0.252061251332E-2, 0.159564501865E-4, -0.764085947576E-8, 0.205305291024E-11, -0.293359668173E-15] },
                { min: 1664.5, max: 1768.1, coeffs: [0.152232118209E+3, -0.268819888545E+0, 0.171280280471E-3, -0.345895706453E-7, -0.934633971046E-14] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -0.226, max: 1.923, coeffs: [0.0000000E+00, 1.8891380E+02, -9.3835290E+01, 1.3068619E+02, -2.2703580E+02, 3.5145659E+02, -3.8953900E+02, 2.8239471E+02, -1.2607281E+02, 3.1353611E+01, -3.3187769E+00] },
                { min: 1.923, max: 13.228, coeffs: [1.334584505E+01, 1.472644573E+02, -1.844024844E+01, 4.031129726E+00, -6.249428360E-01, 6.468412046E-02, -4.458750426E-03, 1.994710149E-04, -5.313401790E-06, 6.481976217E-08] },
                { min: 13.228, max: 19.739, coeffs: [-8.199599416E+01, 1.553962042E+02, -8.342197663E+00, 4.719686976E-01, -1.441693666E-02, 1.492290091E-04] },
                { min: 19.739, max: 21.103, coeffs: [3.406177836E+04, -7.023729171E+03, 5.582903813E+02, -1.952394635E+01, 2.560740231E-01] }
            ]
        },
        'S': {
            // 范围：-50°C到1768°C
            ranges: [
                { min: -50, max: 1064.18, coeffs: [0, 0.540313308631E-2, 0.125934289740E-4, -0.232477968689E-7, 0.322028823036E-10, -0.331465196389E-13, 0.255744251786E-16, -0.125068871393E-19, 0.271443176145E-23] },
                { min: 1064.18, max: 1664.5, coeffs: [0.132900444085E+1, 0.334509311344E-2, 0.654805192818E-5, -0.164856259209E-8, 0.129989605174E-13] },
                { min: 1664.5, max: 1768.1, coeffs: [0.146628232636E+3, -0.258430516752E+0, 0.163693574641E-3, -0.330439046987E-7, -0.943223690612E-14] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: -0.235, max: 1.874, coeffs: [0.00000000E+00, 1.84949460E+02, -8.00504062E+01, 1.02237430E+02, -1.52248592E+02, 1.88821343E+02, -1.59085941E+02, 8.23027880E+01, -2.34181944E+01, 2.79786260E+00] },
                { min: 1.874, max: 11.95, coeffs: [1.291507177E+01, 1.466298863E+02, -1.534713402E+01, 3.145945973E+00, -4.163257839E-01, 3.187963771E-02, -1.291637500E-03, 2.183475087E-05, -1.447379511E-07, 8.211272125E-09] },
                { min: 11.95, max: 17.536, coeffs: [-8.087801117E+01, 1.621573104E+02, -8.536869453E+00, 4.719686976E-01, -1.441693666E-02, 2.081618890E-04] },
                { min: 17.536, max: 18.693, coeffs: [5.333875126E+04, -1.235892298E+04, 1.092657613E+03, -4.265693686E+01, 6.247205420E-01] }
            ]
        },
        'B': {
            // 范围：0°C到1820°C
            ranges: [
                { min: 0, max: 630.615, coeffs: [0, -0.246508183460E-3, 0.590404211710E-5, -0.132579316360E-8, 0.156682919010E-11, -0.169445292400E-14, 0.629903470940E-18] },
                { min: 630.615, max: 1820, coeffs: [-0.389381686210E+1, 0.285717474700E-1, -0.848851047850E-4, 0.157852801640E-6, -0.168353448640E-9, 0.111097940130E-12, -0.445154310330E-16, 0.989756408210E-20, -0.937913302890E-24] }
            ],
            // 逆多项式系数
            inverseRanges: [
                { min: 0.291, max: 2.431, coeffs: [9.8423321E+01, 6.9971500E+02, -8.4765304E+02, 1.0052644E+03, -8.3345952E+02, 4.5508542E+02, -1.5523037E+02, 2.9886750E+01, -2.4742860E+00] },
                { min: 2.431, max: 13.82, coeffs: [2.1315071E+02, 2.8510504E+02, -5.2742887E+01, 9.9160804E+00, -1.2965303E+00, 1.1195870E-01, -6.0625199E-03, 1.8661696E-04, -2.4878585E-06] }
            ]
        }
        // 更多热电偶类型...
    };
    
    // 计算热电偶温度到电动势的转换
    function calculateTCVoltage(temp, type) {
        const tcData = tcCoefficients[type];
        
        // 检查温度是否在有效范围内
        const range = sensorRanges[type];
        if (temp < range.min || temp > range.max) {
            return null;
        }
        
        // 查找适用的温度范围
        let rangeData = null;
        for (const r of tcData.ranges) {
            if (temp >= r.min && temp <= r.max) {
                rangeData = r;
                break;
            }
        }
        
        if (!rangeData) {
            return null;
        }
        
        // 计算电动势
        let voltage = 0;
        for (let i = 0; i < rangeData.coeffs.length; i++) {
            voltage += rangeData.coeffs[i] * Math.pow(temp, i);
        }
        
        return voltage;
    }
    
    // 计算热电偶电动势到温度的转换
    function calculateTCTemperature(voltage, type) {
        const tcData = tcCoefficients[type];
        
        // 查找适用的电压范围
        let rangeData = null;
        for (const r of tcData.inverseRanges) {
            if (voltage >= r.min && voltage <= r.max) {
                rangeData = r;
                break;
            }
        }
        
        if (!rangeData) {
            return null;
        }
        
        // 计算温度
        let temp = 0;
        for (let i = 0; i < rangeData.coeffs.length; i++) {
            temp += rangeData.coeffs[i] * Math.pow(voltage, i);
        }
        
        return temp;
    }
    
    // ================== 辅助函数 ==================
    
    // 迭代法计算温度
    function iterativeTemperatureCalc(targetValue, minTemp, maxTemp, calcFunc, tolerance = 0.01) {
        let low = minTemp;
        let high = maxTemp;
        let mid, value;
        
        // 二分法逼近
        while (high - low > tolerance) {
            mid = (low + high) / 2;
            value = calcFunc(mid);
            
            if (value > targetValue) {
                high = mid;
            } else {
                low = mid;
            }
        }
        
        return (low + high) / 2;
    }
    
    // 温度范围验证
    function validateTemperature(temp, sensorType) {
        if (isNaN(temp)) {
            tempError.textContent = "请输入有效的温度值";
            return false;
        }
        
        const range = sensorRanges[sensorType];
        if (temp < range.min || temp > range.max) {
            tempError.textContent = `温度必须在${range.min}°C至${range.max}°C范围内`;
            return false;
        }
        
        tempError.textContent = "";
        return true;
    }
    
    // 更新温度范围信息
    function updateTempRangeInfo(sensorType) {
        const range = sensorRanges[sensorType];
        tempRangeInfo.textContent = `有效范围: ${range.min}°C 至 ${range.max}°C`;
    }
    
    // RTD电阻值范围验证
    function validateRTDValue(resistance, type) {
        if (isNaN(resistance)) {
            rtdError.textContent = "请输入有效的电阻值";
            return false;
        }
        
        const range = sensorRanges[type];
        
        // 计算最小和最大温度对应的电阻值
        const rMin = calculateRTDResistance(range.min, type);
        const rMax = calculateRTDResistance(range.max, type);
        
        if (resistance < rMin || resistance > rMax) {
            rtdError.textContent = `电阻值必须在${rMin.toFixed(2)}Ω至${rMax.toFixed(2)}Ω范围内`;
            return false;
        }
        
        rtdError.textContent = "";
        return true;
    }
    
    // TC电动势范围验证
    function validateTCValue(voltage, type) {
        if (isNaN(voltage)) {
            tcError.textContent = "请输入有效的电动势值";
            return false;
        }
        
        const range = sensorRanges[type];
        
        // 计算最小和最大温度对应的电动势
        const vMin = calculateTCVoltage(range.min, type);
        const vMax = calculateTCVoltage(range.max, type);
        
        if (voltage < vMin || voltage > vMax) {
            tcError.textContent = `电动势值必须在${vMin.toFixed(2)}mV至${vMax.toFixed(2)}mV范围内`;
            return false;
        }
        
        tcError.textContent = "";
        return true;
    }
    
    // ================== UI更新函数 ==================
    
    // 更新温度到RTD电阻值
    function updateRTDFromTemp() {
        if (isUpdatingRtd) return;
        
        isUpdatingTemp = true;
        
        const temp = parseFloat(temperatureInput.value);
        const type = rtdTypeSelect.value;
        
        if (validateTemperature(temp, type)) {
            const resistance = calculateRTDResistance(temp, type);
            rtdValueInput.value = resistance.toFixed(2);
            rtdError.textContent = "";
        } else {
            rtdValueInput.value = "";
        }
        
        isUpdatingTemp = false;
    }
    
    // 更新RTD电阻值到温度
    function updateTempFromRTD() {
        if (isUpdatingTemp) return;
        
        isUpdatingRtd = true;
        
        const resistance = parseFloat(rtdValueInput.value);
        const type = rtdTypeSelect.value;
        
        if (validateRTDValue(resistance, type)) {
            const temp = calculateRTDTemperature(resistance, type);
            temperatureInput.value = temp.toFixed(2);
            tempError.textContent = "";
        } else {
            temperatureInput.value = "";
        }
        
        isUpdatingRtd = false;
    }
    
    // 更新温度到TC电动势
    function updateTCFromTemp() {
        if (isUpdatingTc) return;
        
        isUpdatingTemp = true;
        
        const temp = parseFloat(temperatureInput.value);
        const type = tcTypeSelect.value;
        
        if (validateTemperature(temp, type)) {
            const voltage = calculateTCVoltage(temp, type);
            tcValueInput.value = voltage.toFixed(2);
            tcError.textContent = "";
        } else {
            tcValueInput.value = "";
        }
        
        isUpdatingTemp = false;
    }
    
    // 更新TC电动势到温度
    function updateTempFromTC() {
        if (isUpdatingTemp) return;
        
        isUpdatingTc = true;
        
        const voltage = parseFloat(tcValueInput.value);
        const type = tcTypeSelect.value;
        
        if (validateTCValue(voltage, type)) {
            const temp = calculateTCTemperature(voltage, type);
            temperatureInput.value = temp.toFixed(2);
            tempError.textContent = "";
        } else {
            temperatureInput.value = "";
        }
        
        isUpdatingTc = false;
    }
    
    // 更新温度计算，根据当前选择的传感器类型
    function updateTemperatureCalculation() {
        if (activeSensorType === 'rtd') {
            if (temperatureInput.value) {
                updateRTDFromTemp();
            } else if (rtdValueInput.value) {
                updateTempFromRTD();
            }
        } else {
            if (temperatureInput.value) {
                updateTCFromTemp();
            } else if (tcValueInput.value) {
                updateTempFromTC();
            }
        }
    }
    
    // 切换传感器类型
    function switchSensorType(type) {
        activeSensorType = type;
        
        // 重置所有激活状态
        tabButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.tab-btn[data-type="${type}"]`).classList.add('active');
        
        // 显示/隐藏相应的部分
        if (type === 'rtd') {
            rtdSection.classList.add('active');
            tcSection.classList.remove('active');
            rtdInfo.classList.add('active');
            tcInfo.classList.remove('active');
            updateTempRangeInfo(rtdTypeSelect.value);
        } else {
            rtdSection.classList.remove('active');
            tcSection.classList.add('active');
            rtdInfo.classList.remove('active');
            tcInfo.classList.add('active');
            updateTempRangeInfo(tcTypeSelect.value);
        }
        
        // 清空错误消息
        tempError.textContent = "";
        rtdError.textContent = "";
        tcError.textContent = "";
        
        // 无条件强制更新显示值
        if (temperatureInput.value) {
            // 如果有温度值，根据当前选择的传感器类型直接更新相应的值
            if (type === 'rtd') {
                updateRTDFromTemp();
            } else {
                updateTCFromTemp();
            }
        } else {
            // 如果没有温度值，则保持原来的逻辑
            updateTemperatureCalculation();
        }
    }
    
    // ================== 事件监听 ==================
    
    // 标签切换
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            switchSensorType(this.dataset.type);
        });
    });
    
    // 热电阻事件
    temperatureInput.addEventListener('input', function() {
        if (activeSensorType === 'rtd') {
            updateRTDFromTemp();
        } else {
            updateTCFromTemp();
        }
    });
    
    rtdValueInput.addEventListener('input', updateTempFromRTD);
    
    rtdTypeSelect.addEventListener('change', function() {
        updateTempRangeInfo(this.value);
        updateTemperatureCalculation();
    });
    
    // 热电偶事件
    tcValueInput.addEventListener('input', updateTempFromTC);
    
    tcTypeSelect.addEventListener('change', function() {
        updateTempRangeInfo(this.value);
        updateTemperatureCalculation();
    });
    
    // 初始化
    updateTempRangeInfo(rtdTypeSelect.value);
    temperatureInput.value = "25.00";
    updateRTDFromTemp();

    // 深色模式切换功能
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const htmlElement = document.documentElement;
    
    // 检查用户偏好设置
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    
    // 根据用户偏好设置初始主题
    if (savedTheme === 'dark' || (!savedTheme && prefersDarkMode)) {
        htmlElement.setAttribute('data-theme', 'dark');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    }
    
    // 切换主题
    themeToggle.addEventListener('click', function(e) {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        // 获取容器元素
        const container = document.querySelector('.container');
        const containerRect = container.getBoundingClientRect();
        
        // 计算相对于容器的点击位置
        const x = e.clientX - containerRect.left;
        const y = e.clientY - containerRect.top;
        
        // 立即切换图标，增强响应感
        if (newTheme === 'light') {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
        
        // 创建主涟漪元素，添加到容器内
        const ripple = document.createElement('div');
        ripple.className = `theme-ripple ${newTheme}`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        container.appendChild(ripple);
        
        // 创建次级涟漪元素，添加到容器内
        for (let i = 0; i < 2; i++) {
            const subRipple = document.createElement('div');
            subRipple.className = `theme-sub-ripple ${newTheme}`;
            subRipple.style.left = `${x}px`;
            subRipple.style.top = `${y}px`;
            subRipple.style.animationDelay = `${i * 100}ms`;
            container.appendChild(subRipple);
            
            // 次级涟漪在动画结束后移除
            subRipple.addEventListener('animationend', () => {
                if (container.contains(subRipple)) {
                    container.removeChild(subRipple);
                }
            });
        }
        
        // 延迟一段时间后切换主题，等待动画效果初步呈现
        setTimeout(() => {
            // 设置data-theme属性来切换主题
            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // 可选：在容器上添加类以标记正在过渡中
            container.classList.add('theme-transitioning');
            
            // 触发自定义事件，通知内容区域进行主题更新
            document.dispatchEvent(new CustomEvent('themeChanged', {
                detail: { theme: newTheme }
            }));
        }, 135);
        
        // 动画结束后移除主涟漪元素和过渡标记类
        ripple.addEventListener('animationend', () => {
            if (container.contains(ripple)) {
                container.removeChild(ripple);
                container.classList.remove('theme-transitioning');
            }
        });
    });
    
    // 温度可视化图表初始化
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    let temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 11}, (_, i) => (i * 10 - 50)),
            datasets: [{
                label: '电阻值 (Ω)',
                data: Array.from({length: 11}, (_, i) => calculateRTDResistance(i * 10 - 50, 'PT100')),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    title: {
                        display: true,
                        text: '温度 (°C)'
                    }
                }
            },
            interaction: {
                intersect: false
            }
        }
    });
    
    // 传感器类型变化时更新图表
    function updateChart() {
        const sensorType = activeSensorType;
        const tempRange = [-50, -30, -10, 0, 20, 40, 60, 80, 100, 120, 150];
        let chartData = [];
        
        if (sensorType === 'rtd') {
            const rtdType = rtdTypeSelect.value;
            chartData = tempRange.map(temp => calculateRTDResistance(temp, rtdType));
            temperatureChart.data.datasets[0].label = '电阻值 (Ω)';
            temperatureChart.data.datasets[0].borderColor = '#2563eb';
            temperatureChart.data.datasets[0].backgroundColor = 'rgba(37, 99, 235, 0.1)';
        } else {
            const tcType = tcTypeSelect.value;
            chartData = tempRange.map(temp => calculateTCVoltage(temp, tcType));
            temperatureChart.data.datasets[0].label = '电动势 (mV)';
            temperatureChart.data.datasets[0].borderColor = '#10b981';
            temperatureChart.data.datasets[0].backgroundColor = 'rgba(16, 185, 129, 0.1)';
        }
        
        temperatureChart.data.labels = tempRange;
        temperatureChart.data.datasets[0].data = chartData;
        temperatureChart.update();
    }
    
    // 更新传感器类型徽章
    function updateSensorBadge() {
        const badge = document.getElementById('temp-range-badge');
        const currentType = activeSensorType === 'rtd' ? rtdTypeSelect.value : tcTypeSelect.value;
        const range = sensorRanges[currentType];
        badge.textContent = `${range.min}°C ~ ${range.max}°C`;
    }
    
    // 更新信息卡片
    function updateInfoCards() {
        if (activeSensorType === 'rtd') {
            const rtdType = rtdTypeSelect.value;
            const precisionEl = document.getElementById('rtd-precision');
            const coefficientEl = document.getElementById('rtd-coefficient');
            
            switch(rtdType) {
                case 'PT100':
                case 'PT1000':
                    precisionEl.textContent = '±0.1%';
                    coefficientEl.textContent = 'α = 0.00385';
                    break;
                case 'Cu50':
                    precisionEl.textContent = '±0.2%';
                    coefficientEl.textContent = 'α = 0.00428';
                    break;
                case 'Ni120':
                    precisionEl.textContent = '±0.2%';
                    coefficientEl.textContent = 'α = 0.00617';
                    break;
            }
        } else {
            const tcType = tcTypeSelect.value;
            const sensitivityEl = document.getElementById('tc-sensitivity');
            const accuracyEl = document.getElementById('tc-accuracy');
            
            switch(tcType) {
                case 'K':
                    sensitivityEl.textContent = '41 µV/°C';
                    accuracyEl.textContent = '±1.5°C';
                    break;
                case 'J':
                    sensitivityEl.textContent = '55 µV/°C';
                    accuracyEl.textContent = '±1.5°C';
                    break;
                case 'T':
                    sensitivityEl.textContent = '43 µV/°C';
                    accuracyEl.textContent = '±1.0°C';
                    break;
                case 'E':
                    sensitivityEl.textContent = '68 µV/°C';
                    accuracyEl.textContent = '±1.5°C';
                    break;
                case 'N':
                    sensitivityEl.textContent = '39 µV/°C';
                    accuracyEl.textContent = '±1.5°C';
                    break;
                case 'R':
                case 'S':
                    sensitivityEl.textContent = '10 µV/°C';
                    accuracyEl.textContent = '±0.6°C';
                    break;
                case 'B':
                    sensitivityEl.textContent = '9 µV/°C';
                    accuracyEl.textContent = '±0.5°C';
                    break;
            }
        }
    }
    
    // 添加到现有函数
    const originalSwitchSensorType = switchSensorType;
    switchSensorType = function(type) {
        originalSwitchSensorType(type);
        updateChart();
        updateSensorBadge();
        updateInfoCards();
    };
    
    const originalUpdateTempRangeInfo = updateTempRangeInfo;
    updateTempRangeInfo = function(sensorType) {
        originalUpdateTempRangeInfo(sensorType);
        updateSensorBadge();
    };
    
    // 初始化UI元素
    updateSensorBadge();
    updateInfoCards();
    
    // 添加到现有选择变化事件
    rtdTypeSelect.addEventListener('change', function() {
        updateTemperatureCalculation();
        updateChart();
        updateSensorBadge();
        updateInfoCards();
    });
    
    tcTypeSelect.addEventListener('change', function() {
        updateTemperatureCalculation();
        updateChart();
        updateSensorBadge();
        updateInfoCards();
    });
});