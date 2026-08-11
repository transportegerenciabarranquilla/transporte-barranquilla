#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

[InitializeOnLoad]
public static class PrototypeBootstrap
{
    private const string ScenePath = "Assets/Scenes/PrototypeArena.unity";

    static PrototypeBootstrap()
    {
        EditorApplication.delayCall += CreatePrototypeOnce;
    }

    [MenuItem("Interconexion/Crear escena prototipo")]
    public static void CreatePrototypeOnce()
    {
        if (Application.isPlaying || EditorApplication.isCompiling || AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null) return;
        BuildPrototype();
    }

    [MenuItem("Interconexion/Reconstruir arena mejorada")]
    public static void RebuildPrototype()
    {
        if (Application.isPlaying || EditorApplication.isCompiling) return;
        BuildPrototype();
    }

    private static void BuildPrototype()
    {
        ConfigureCharacterImports();

        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        scene.name = "PrototypeArena";

        Material groundMaterial = CreateMaterial("ArenaGround", new Color(0.10f, 0.28f, 0.34f));
        Material obstacleMaterial = CreateMaterial("ArenaObstacle", new Color(0.95f, 0.38f, 0.16f));
        Material wallMaterial = CreateMaterial("ArenaWall", new Color(0.12f, 0.16f, 0.23f));
        Material buildingMaterial = CreateMaterial("ArenaBuilding", new Color(0.22f, 0.32f, 0.42f));
        Material accentMaterial = CreateMaterial("ArenaAccent", new Color(0.05f, 0.85f, 0.92f));
        Material crateMaterial = CreateMaterial("ArenaCrate", new Color(0.55f, 0.32f, 0.12f));
        Material[] playerMaterials =
        {
            CreateMaterial("PlayerAqua", new Color(0.18f, 0.72f, 1f)),
            CreateMaterial("PlayerCrimson", new Color(0.95f, 0.2f, 0.24f)),
            CreateMaterial("PlayerLime", new Color(0.4f, 0.9f, 0.25f)),
            CreateMaterial("PlayerViolet", new Color(0.65f, 0.3f, 1f)),
            CreateMaterial("PlayerGold", new Color(1f, 0.72f, 0.1f)),
        };

        GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Arena Ground";
        ground.transform.localScale = new Vector3(8f, 1f, 8f);
        ground.GetComponent<Renderer>().sharedMaterial = groundMaterial;

        Vector3[] obstaclePositions =
        {
            new(-7f, 1f, 2f), new(7f, 1f, -2f), new(-3f, 1f, 8f),
            new(4f, 1f, 6f), new(1f, 1f, -8f), new(-9f, 1f, -7f)
        };
        for (int index = 0; index < obstaclePositions.Length; index++)
        {
            GameObject obstacle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            obstacle.name = $"Obstacle {index + 1}";
            obstacle.transform.position = obstaclePositions[index];
            obstacle.transform.localScale = index % 2 == 0 ? new Vector3(3f, 2f, 2f) : new Vector3(2f, 2f, 4f);
            obstacle.GetComponent<Renderer>().sharedMaterial = obstacleMaterial;
        }

        GameObject structures = new("Arena Structures");
        CreateBox(structures.transform, "North Wall", new Vector3(0f, 2f, 39.5f), new Vector3(80f, 4f, 1f), wallMaterial);
        CreateBox(structures.transform, "South Wall", new Vector3(0f, 2f, -39.5f), new Vector3(80f, 4f, 1f), wallMaterial);
        CreateBox(structures.transform, "East Wall", new Vector3(39.5f, 2f, 0f), new Vector3(1f, 4f, 80f), wallMaterial);
        CreateBox(structures.transform, "West Wall", new Vector3(-39.5f, 2f, 0f), new Vector3(1f, 4f, 80f), wallMaterial);

        CreateBuilding(structures.transform, "Hangar Azul", new Vector3(-13f, 0f, 11f), buildingMaterial, accentMaterial);
        CreateBuilding(structures.transform, "Hangar Rojo", new Vector3(13f, 0f, -11f), buildingMaterial, obstacleMaterial);
        CreateTower(structures.transform, "Torre Noroeste", new Vector3(-15.5f, 0f, -14.5f), wallMaterial, accentMaterial);
        CreateTower(structures.transform, "Torre Sureste", new Vector3(15.5f, 0f, 14.5f), wallMaterial, obstacleMaterial);
        CreateBuilding(structures.transform, "Depósito Norte", new Vector3(25f, 0f, 25f), buildingMaterial, accentMaterial);
        CreateBuilding(structures.transform, "Laboratorio Sur", new Vector3(-25f, 0f, -25f), buildingMaterial, obstacleMaterial);
        CreateTower(structures.transform, "Torre Noreste", new Vector3(32f, 0f, -30f), wallMaterial, accentMaterial);
        CreateTower(structures.transform, "Torre Suroeste", new Vector3(-32f, 0f, 30f), wallMaterial, obstacleMaterial);

        GameObject core = CreateCylinder(structures.transform, "Núcleo central", new Vector3(0f, 2.25f, 0f), new Vector3(2.2f, 2.25f, 2.2f), accentMaterial);
        Light coreLight = core.AddComponent<Light>();
        coreLight.type = LightType.Point;
        coreLight.color = new Color(0.1f, 0.9f, 1f);
        coreLight.intensity = 5f;
        coreLight.range = 12f;
        CreateCylinder(structures.transform, "Plataforma central", new Vector3(0f, 0.3f, 0f), new Vector3(4.5f, 0.3f, 4.5f), wallMaterial);

        Vector3[] cratePositions =
        {
            new(-5f, 0.75f, -5f), new(-6.6f, 0.75f, -5f), new(6f, 0.75f, 4f),
            new(7.6f, 0.75f, 4f), new(-10f, 0.75f, 2f), new(11f, 0.75f, -2f)
        };
        for (int index = 0; index < cratePositions.Length; index++)
        {
            CreateBox(structures.transform, $"Caja {index + 1}", cratePositions[index], new Vector3(1.4f, 1.4f, 1.4f), crateMaterial);
        }

        CreateRamp(structures.transform, "Rampa Este", new Vector3(9f, 0.7f, 9f), new Vector3(4f, 0.5f, 7f), new Vector3(12f, 0f, 0f), buildingMaterial);
        CreateRamp(structures.transform, "Rampa Oeste", new Vector3(-9f, 0.7f, -9f), new Vector3(4f, 0.5f, 7f), new Vector3(-12f, 180f, 0f), buildingMaterial);
        AddImportedEnvironment(structures.transform);

        GameObject player = new("Player");
        player.name = "Player";
        player.tag = "Player";
        player.transform.position = new Vector3(0f, 1.1f, 0f);
        CharacterController characterController = player.AddComponent<CharacterController>();
        characterController.height = 2f;
        characterController.radius = 0.48f;
        characterController.center = Vector3.zero;
        player.AddComponent<ThirdPersonPlayer>();
        player.AddComponent<PlayerCombat>();
        player.AddComponent<CombatHealth>();
        GameObject[] characterVariants =
        {
            CreateModelVariant(player.transform, "Bárbaro", "Assets/Characters/KayKit/Barbarian.glb", playerMaterials[0]),
            CreateModelVariant(player.transform, "Caballero", "Assets/Characters/KayKit/Knight.glb", playerMaterials[1]),
            CreateModelVariant(player.transform, "Maga", "Assets/Characters/KayKit/Mage.glb", playerMaterials[2]),
            CreateModelVariant(player.transform, "Pícaro", "Assets/Characters/KayKit/Rogue.glb", playerMaterials[3]),
        };
        CharacterSelector selector = player.AddComponent<CharacterSelector>();
        selector.Configure(characterVariants, new[] { "Bárbaro", "Caballero", "Maga", "Pícaro" });

        GameObject gameplay = new("Weapons and Rivals");
        CreateWeaponPickup(gameplay.transform, "Lanzaburbujas", new Vector3(-15f, 1.2f, 4f), 25, 0.28f, new Color(0.1f, 0.85f, 1f));
        CreateWeaponPickup(gameplay.transform, "Rayo encogedor", new Vector3(18f, 1.2f, -8f), 40, 0.5f, new Color(0.75f, 0.2f, 1f));
        CreateWeaponPickup(gameplay.transform, "Cañón gelatinoso", new Vector3(5f, 1.2f, 24f), 60, 0.85f, new Color(0.3f, 1f, 0.25f));
        CreateWeaponPickup(gameplay.transform, "Bláster de rebote", new Vector3(-24f, 1.2f, -7f), 18, 0.16f, new Color(1f, 0.55f, 0.05f));

        CreateBot(gameplay.transform, "Rival 1", new Vector3(20f, 1f, 20f), "Assets/Characters/KayKit/Knight.glb");
        CreateBot(gameplay.transform, "Rival 2", new Vector3(-20f, 1f, 18f), "Assets/Characters/KayKit/Mage.glb");
        CreateBot(gameplay.transform, "Rival 3", new Vector3(24f, 1f, -22f), "Assets/Characters/KayKit/Rogue.glb");
        CreateBot(gameplay.transform, "Rival 4", new Vector3(-22f, 1f, -20f), "Assets/Characters/KayKit/Barbarian.glb");

        GameObject cameraObject = new("Main Camera");
        cameraObject.tag = "MainCamera";
        Camera camera = cameraObject.AddComponent<Camera>();
        camera.fieldOfView = 65f;
        camera.nearClipPlane = 0.1f;
        cameraObject.AddComponent<AudioListener>();
        ThirdPersonCamera followCamera = cameraObject.AddComponent<ThirdPersonCamera>();
        followCamera.SetTarget(player.transform);
        cameraObject.transform.position = new Vector3(0f, 4f, -6f);

        GameObject lightObject = new("Directional Light");
        Light light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.25f;
        light.color = new Color(1f, 0.95f, 0.85f);
        lightObject.transform.rotation = Quaternion.Euler(48f, -35f, 0f);

        camera.backgroundColor = new Color(0.025f, 0.07f, 0.12f);
        RenderSettings.ambientLight = new Color(0.22f, 0.3f, 0.4f);
        RenderSettings.fog = true;
        RenderSettings.fogColor = new Color(0.04f, 0.12f, 0.17f);
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogDensity = 0.008f;
        EditorSceneManager.SaveScene(scene, ScenePath);
        Selection.activeGameObject = player;
        Debug.Log("[Interconexion] Escena PrototypeArena creada. Presiona Play para probarla.");
    }

    private static Material CreateMaterial(string name, Color color)
    {
        const string folder = "Assets/Prototype/Materials";
        if (!AssetDatabase.IsValidFolder("Assets/Prototype")) AssetDatabase.CreateFolder("Assets", "Prototype");
        if (!AssetDatabase.IsValidFolder(folder)) AssetDatabase.CreateFolder("Assets/Prototype", "Materials");
        string path = $"{folder}/{name}.mat";
        Material existing = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (existing != null) return existing;
        Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
        Material material = new(shader) { name = name, color = color };
        if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 0.38f);
        if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", 0.18f);
        AssetDatabase.CreateAsset(material, path);
        return material;
    }

    private static GameObject CreateCharacterVariant(Transform parent, string name, PrimitiveType primitive, Vector3 scale, Material material)
    {
        GameObject variant = GameObject.CreatePrimitive(primitive);
        variant.name = name;
        variant.transform.SetParent(parent, false);
        variant.transform.localPosition = Vector3.zero;
        variant.transform.localScale = scale;
        Collider collider = variant.GetComponent<Collider>();
        if (collider != null) Object.DestroyImmediate(collider);
        variant.GetComponent<Renderer>().sharedMaterial = material;
        return variant;
    }

    private static GameObject CreateModelVariant(Transform parent, string name, string assetPath, Material fallbackMaterial)
    {
        GameObject model = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
        if (model == null) return CreateCharacterVariant(parent, name, PrimitiveType.Capsule, Vector3.one, fallbackMaterial);
        GameObject variant = (GameObject)PrefabUtility.InstantiatePrefab(model);
        variant.name = name;
        variant.transform.SetParent(parent, false);
        variant.transform.localPosition = new Vector3(0f, -1f, 0f);
        variant.transform.localRotation = Quaternion.identity;
        variant.transform.localScale = Vector3.one;
        foreach (Collider collider in variant.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(collider);
        Animator animator = variant.GetComponentInChildren<Animator>() ?? variant.AddComponent<Animator>();
        animator.runtimeAnimatorController = CreateAnimatorController(assetPath);
        return variant;
    }

    private static RuntimeAnimatorController CreateAnimatorController(string modelPath)
    {
        const string folder = "Assets/Prototype/Animations";
        if (!AssetDatabase.IsValidFolder(folder)) AssetDatabase.CreateFolder("Assets/Prototype", "Animations");
        string characterId = System.IO.Path.GetFileNameWithoutExtension(modelPath);
        string controllerPath = $"{folder}/{characterId}.controller";
        AnimatorController existing = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
        if (existing != null) return existing;
        AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
        controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
        controller.AddParameter("Die", AnimatorControllerParameterType.Trigger);
        controller.AddParameter("Shoot", AnimatorControllerParameterType.Trigger);

        AnimationClip FindClip(string clipName)
        {
            foreach (Object asset in AssetDatabase.LoadAllAssetsAtPath(modelPath))
                if (asset is AnimationClip clip && clip.name == clipName) return clip;
            return null;
        }

        AnimatorStateMachine machine = controller.layers[0].stateMachine;
        AnimatorState idle = machine.AddState("Idle");
        AnimatorState walk = machine.AddState("Walk");
        AnimatorState sprint = machine.AddState("Sprint");
        AnimatorState shoot = machine.AddState("Shoot");
        AnimatorState die = machine.AddState("Die");
        bool kayKit = modelPath.EndsWith(".glb", System.StringComparison.OrdinalIgnoreCase);
        idle.motion = FindClip(kayKit ? "Idle" : "idle");
        walk.motion = FindClip(kayKit ? "Walking_A" : "walk");
        sprint.motion = FindClip(kayKit ? "Running_A" : "sprint");
        shoot.motion = FindClip(kayKit ? "2H_Ranged_Shoot" : "holding-both-shoot");
        die.motion = FindClip(kayKit ? "Death_A" : "die");
        machine.defaultState = idle;

        AddTransition(idle, walk, "Speed", AnimatorConditionMode.Greater, 0.1f);
        AddTransition(walk, idle, "Speed", AnimatorConditionMode.Less, 0.1f);
        AddTransition(walk, sprint, "Speed", AnimatorConditionMode.Greater, 0.75f);
        AddTransition(sprint, walk, "Speed", AnimatorConditionMode.Less, 0.75f);
        AnimatorStateTransition shootTransition = machine.AddAnyStateTransition(shoot);
        shootTransition.hasExitTime = false;
        shootTransition.AddCondition(AnimatorConditionMode.If, 0f, "Shoot");
        AnimatorStateTransition shootExit = shoot.AddTransition(idle);
        shootExit.hasExitTime = true;
        shootExit.exitTime = 0.95f;
        AnimatorStateTransition dieTransition = machine.AddAnyStateTransition(die);
        dieTransition.hasExitTime = false;
        dieTransition.AddCondition(AnimatorConditionMode.If, 0f, "Die");
        return controller;
    }

    private static void ConfigureCharacterImports()
    {
        foreach (string letter in new[] { "a", "b", "c", "d", "e" })
        {
            string path = $"Assets/Characters/Kenney/character-{letter}.fbx";
            ModelImporter importer = AssetImporter.GetAtPath(path) as ModelImporter;
            if (importer == null) continue;
            ModelImporterClipAnimation[] clips = importer.defaultClipAnimations;
            bool changed = false;
            foreach (ModelImporterClipAnimation clip in clips)
            {
                bool shouldLoop = clip.name == "idle" || clip.name == "walk" || clip.name == "sprint";
                if (shouldLoop && !clip.loopTime)
                {
                    clip.loopTime = true;
                    changed = true;
                }
            }
            if (!changed) continue;
            importer.clipAnimations = clips;
            importer.SaveAndReimport();
        }
    }

    private static void AddTransition(AnimatorState from, AnimatorState to, string parameter, AnimatorConditionMode mode, float threshold)
    {
        AnimatorStateTransition transition = from.AddTransition(to);
        transition.hasExitTime = false;
        transition.duration = 0.12f;
        transition.AddCondition(mode, threshold, parameter);
    }

    private static void CreateWeaponPickup(Transform parent, string name, Vector3 position, int damage, float interval, Color color)
    {
        GameObject root = new(name);
        root.transform.SetParent(parent);
        root.transform.position = position;
        SphereCollider trigger = root.AddComponent<SphereCollider>();
        trigger.isTrigger = true;
        trigger.radius = 1.2f;
        Rigidbody body = root.AddComponent<Rigidbody>();
        body.isKinematic = true;
        body.useGravity = false;
        WeaponPickup pickup = root.AddComponent<WeaponPickup>();
        pickup.Configure(name, damage, interval, color);
        Material material = CreateMaterial(name.Replace(" ", ""), color);
        GameObject barrel = CreateCylinder(root.transform, "Barrel", position, new Vector3(0.25f, 0.8f, 0.25f), material);
        barrel.transform.localPosition = Vector3.zero;
        barrel.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
        foreach (Collider collider in root.GetComponentsInChildren<Collider>()) if (collider != trigger) Object.DestroyImmediate(collider);
        GameObject orb = CreatePrimitiveVisual(root.transform, PrimitiveType.Sphere, "Energy Core", new Vector3(0f, 0.35f, 0f), Vector3.one * 0.55f, material);
        Light light = orb.AddComponent<Light>();
        light.color = color;
        light.range = 5f;
        light.intensity = 2f;
    }

    private static void CreateBot(Transform parent, string name, Vector3 position, string modelPath)
    {
        GameObject bot = new(name);
        bot.transform.SetParent(parent);
        bot.transform.position = position;
        CapsuleCollider collider = bot.AddComponent<CapsuleCollider>();
        collider.height = 2f;
        collider.radius = 0.48f;
        collider.center = Vector3.up;
        bot.AddComponent<CombatHealth>();
        bot.AddComponent<BotShooter>();
        CreateModelVariant(bot.transform, $"{name} Model", modelPath, CreateMaterial("BotFallback", Color.red));
    }

    private static GameObject CreatePrimitiveVisual(Transform parent, PrimitiveType type, string name, Vector3 localPosition, Vector3 scale, Material material)
    {
        GameObject item = GameObject.CreatePrimitive(type);
        item.name = name;
        item.transform.SetParent(parent, false);
        item.transform.localPosition = localPosition;
        item.transform.localScale = scale;
        Collider collider = item.GetComponent<Collider>();
        if (collider != null) Object.DestroyImmediate(collider);
        item.GetComponent<Renderer>().sharedMaterial = material;
        return item;
    }

    private static GameObject CreateBox(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
    {
        GameObject item = GameObject.CreatePrimitive(PrimitiveType.Cube);
        item.name = name;
        item.transform.SetParent(parent);
        item.transform.position = position;
        item.transform.localScale = scale;
        item.GetComponent<Renderer>().sharedMaterial = material;
        return item;
    }

    private static GameObject CreateCylinder(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
    {
        GameObject item = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        item.name = name;
        item.transform.SetParent(parent);
        item.transform.position = position;
        item.transform.localScale = scale;
        item.GetComponent<Renderer>().sharedMaterial = material;
        return item;
    }

    private static void CreateBuilding(Transform parent, string name, Vector3 position, Material body, Material accent)
    {
        GameObject root = new(name);
        root.transform.SetParent(parent);
        root.transform.position = position;
        CreateBox(root.transform, "Base", position + new Vector3(0f, 1.5f, 0f), new Vector3(8f, 3f, 6f), body);
        CreateBox(root.transform, "Roof", position + new Vector3(0f, 3.4f, 0f), new Vector3(8.7f, 0.35f, 6.7f), accent);
        CreateBox(root.transform, "Door", position + new Vector3(0f, 1.25f, -3.05f), new Vector3(2.4f, 2.5f, 0.25f), accent);
    }

    private static void CreateTower(Transform parent, string name, Vector3 position, Material body, Material accent)
    {
        GameObject root = new(name);
        root.transform.SetParent(parent);
        CreateCylinder(root.transform, "Column", position + new Vector3(0f, 3f, 0f), new Vector3(2f, 3f, 2f), body);
        CreateCylinder(root.transform, "Beacon", position + new Vector3(0f, 6.4f, 0f), new Vector3(2.5f, 0.35f, 2.5f), accent);
    }

    private static void CreateRamp(Transform parent, string name, Vector3 position, Vector3 scale, Vector3 rotation, Material material)
    {
        GameObject ramp = CreateBox(parent, name, position, scale, material);
        ramp.transform.eulerAngles = rotation;
    }

    private static void AddImportedEnvironment(Transform parent)
    {
        string industrial = "Assets/Environment/Kenney/Industrial";
        string roads = "Assets/Environment/Kenney/Roads";
        string[] buildings = { "building-a", "building-b", "building-c", "building-d", "building-e", "building-f" };
        Vector3[] positions =
        {
            new(-29f, 0f, 25f), new(-29f, 0f, 10f), new(-29f, 0f, -10f),
            new(29f, 0f, 25f), new(29f, 0f, 5f), new(29f, 0f, -22f)
        };
        for (int index = 0; index < buildings.Length; index++)
            InstantiateScenery($"{industrial}/{buildings[index]}.fbx", parent, $"Industrial {index + 1}", positions[index], index >= 3 ? 180f : 0f, true);

        InstantiateScenery($"{industrial}/chimney-large.fbx", parent, "Gran chimenea", new Vector3(-33f, 0f, -30f), 0f, true);
        InstantiateScenery($"{industrial}/detail-tank.fbx", parent, "Tanque industrial", new Vector3(33f, 0f, 30f), 0f, true);
        InstantiateScenery($"{roads}/road-crossroad.fbx", parent, "Cruce central", new Vector3(0f, 0.03f, 0f), 0f, false);
        for (int offset = -8; offset <= 8; offset++)
        {
            if (offset == 0) continue;
            InstantiateScenery($"{roads}/road-straight.fbx", parent, $"Road Z {offset}", new Vector3(0f, 0.03f, offset * 4f), 0f, false);
            InstantiateScenery($"{roads}/road-straight.fbx", parent, $"Road X {offset}", new Vector3(offset * 4f, 0.035f, 0f), 90f, false);
        }
        for (int index = -3; index <= 3; index++)
        {
            InstantiateScenery($"{roads}/light-square.fbx", parent, $"Street Light {index + 4}", new Vector3(5f, 0f, index * 10f), 0f, false);
            GameObject lamp = new($"Lamp Glow {index + 4}");
            lamp.transform.SetParent(parent);
            lamp.transform.position = new Vector3(5f, 5.5f, index * 10f);
            Light light = lamp.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = new Color(0.45f, 0.8f, 1f);
            light.intensity = 3f;
            light.range = 10f;
        }
        for (int index = 0; index < 8; index++)
        {
            Vector3 position = new(-10f + index * 2.7f, 0f, 13f);
            InstantiateScenery($"{roads}/construction-barrier.fbx", parent, $"Barrier {index + 1}", position, index % 2 == 0 ? 0f : 180f, false);
        }
        InstantiateScenery($"{roads}/sign-highway.fbx", parent, "Arena Sign", new Vector3(0f, 0f, -30f), 0f, false);
    }

    private static GameObject InstantiateScenery(string assetPath, Transform parent, string name, Vector3 position, float yaw, bool addCollider)
    {
        GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
        if (prefab == null) return null;
        GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        instance.name = name;
        instance.transform.SetParent(parent);
        instance.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
        if (addCollider)
        {
            Renderer[] renderers = instance.GetComponentsInChildren<Renderer>();
            if (renderers.Length > 0)
            {
                Bounds bounds = renderers[0].bounds;
                for (int index = 1; index < renderers.Length; index++) bounds.Encapsulate(renderers[index].bounds);
                BoxCollider collider = instance.AddComponent<BoxCollider>();
                collider.center = instance.transform.InverseTransformPoint(bounds.center);
                collider.size = bounds.size;
            }
        }
        return instance;
    }
}
#endif
