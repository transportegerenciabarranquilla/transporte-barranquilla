#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class CharacterAssetDiagnostics
{
    public static void LogClips()
    {
        foreach (string letter in new[] { "a", "b", "c", "d", "e" })
        {
            string path = $"Assets/Characters/Kenney/character-{letter}.fbx";
            foreach (Object asset in AssetDatabase.LoadAllAssetsAtPath(path))
            {
                if (asset is AnimationClip clip && !clip.name.StartsWith("__preview__"))
                    Debug.Log($"[CharacterClip] {path} :: {clip.name} ({clip.length:0.00}s)");
            }
        }
        foreach (string character in new[] { "Barbarian", "Knight", "Mage", "Rogue" })
        {
            string path = $"Assets/Characters/KayKit/{character}.glb";
            GameObject model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Debug.Log($"[KayKitModel] {path} :: loaded={model != null}");
            foreach (Object asset in AssetDatabase.LoadAllAssetsAtPath(path))
            {
                if (asset is AnimationClip clip && !clip.name.StartsWith("__preview__"))
                    Debug.Log($"[KayKitClip] {path} :: {clip.name} ({clip.length:0.00}s)");
            }
        }
    }
}
#endif
